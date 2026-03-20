"""
Quality Drift Detection Service.

Algorithm:
1. For each active drift test, retrieve golden prompts.
2. Call the target LLM model with each golden prompt.
3. An evaluator LLM (Claude) scores each response on a 0-10 scale:
   - 10: Perfect match to expected quality/content
   -  7: Minor differences but functionally equivalent
   -  4: Noticeable quality degradation
   -  1: Complete failure or irrelevant response
4. Compute weighted average score across all prompts.
5. Compare to baseline (first run or user-defined).
6. If score drops below project threshold, trigger alert.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import anthropic
import openai

from ..core.config import get_settings
from ..core.supabase import get_supabase
from .alert_service import AlertService

logger = logging.getLogger(__name__)

EVALUATOR_SYSTEM_PROMPT = """You are an expert LLM response quality evaluator.

Your task is to score an LLM's response against the expected quality for a given prompt.

Scoring scale (0-10):
- 10: Perfect — fully addresses the prompt, accurate, well-structured
- 8-9: Excellent — minor stylistic differences, content is correct and complete
- 6-7: Good — functionally correct but missing some detail or clarity
- 4-5: Fair — partially addresses prompt, noticeable quality issues
- 2-3: Poor — major gaps, inaccuracies, or off-topic content
- 0-1: Failure — completely wrong, irrelevant, or harmful

Respond ONLY with valid JSON in this exact format:
{
  "score": <number 0-10>,
  "reasoning": "<one sentence explaining the score>"
}"""


def _call_openai(model: str, messages: list, api_key: Optional[str] = None) -> tuple[str, int, int]:
    """Call OpenAI model. Returns (response_text, prompt_tokens, completion_tokens)."""
    client = openai.OpenAI(api_key=api_key or get_settings().openai_api_key)
    response = client.chat.completions.create(model=model, messages=messages, max_tokens=2048)
    text = response.choices[0].message.content or ""
    return text, response.usage.prompt_tokens, response.usage.completion_tokens


def _call_anthropic(model: str, messages: list, system: Optional[str] = None,
                    api_key: Optional[str] = None) -> tuple[str, int, int]:
    """Call Anthropic model. Returns (response_text, input_tokens, output_tokens)."""
    client = anthropic.Anthropic(api_key=api_key or get_settings().anthropic_api_key)
    kwargs: dict = {"model": model, "max_tokens": 2048, "messages": messages}
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    text = response.content[0].text if response.content else ""
    return text, response.usage.input_tokens, response.usage.output_tokens


def _evaluate_response(
    prompt: str,
    response: str,
    expected_response: Optional[str],
    evaluator_model: str,
) -> tuple[float, str]:
    """
    Use an evaluator LLM to score the response quality.
    Returns (score 0-10, reasoning).
    """
    eval_messages = [
        {
            "role": "user",
            "content": (
                f"PROMPT:\n{prompt}\n\n"
                f"ACTUAL RESPONSE:\n{response}\n\n"
                + (f"EXPECTED RESPONSE (for reference):\n{expected_response}\n\n" if expected_response else "")
                + "Score this response on the 0-10 scale."
            )
        }
    ]

    try:
        if evaluator_model.startswith("claude-"):
            text, _, _ = _call_anthropic(evaluator_model, eval_messages, EVALUATOR_SYSTEM_PROMPT)
        else:
            # Inject system into messages for OpenAI
            eval_messages = [{"role": "system", "content": EVALUATOR_SYSTEM_PROMPT}] + eval_messages
            text, _, _ = _call_openai(evaluator_model, eval_messages)

        result = json.loads(text.strip())
        score = float(result["score"])
        reasoning = result.get("reasoning", "")
        return max(0.0, min(10.0, score)), reasoning

    except Exception as e:
        logger.error(f"Evaluator failed: {e}")
        return 5.0, f"Evaluation failed: {e}"


class DriftDetectionService:
    """Runs drift tests and records results."""

    def __init__(self):
        self.supabase = get_supabase()
        self.alert_service = AlertService()

    def run_drift_test(self, drift_test_id: str) -> Optional[dict]:
        """
        Execute a drift test and store results.
        Returns the result record or None on failure.
        """
        # Fetch test config
        test_result = (
            self.supabase.table("drift_tests")
            .select("*")
            .eq("id", drift_test_id)
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        if not test_result.data:
            logger.error(f"Drift test {drift_test_id} not found")
            return None

        test = test_result.data
        golden_prompts = test["golden_prompts"]

        if not golden_prompts:
            logger.warning(f"Drift test {drift_test_id} has no golden prompts")
            return None

        # Fetch project for threshold
        project = (
            self.supabase.table("projects")
            .select("quality_score_threshold, owner_id")
            .eq("id", test["project_id"])
            .maybe_single()
            .execute()
        ).data

        logger.info(f"Running drift test '{test['name']}' with {len(golden_prompts)} prompts")

        prompt_results = []
        total_tokens = 0
        total_cost = 0.0
        weighted_score_sum = 0.0
        total_weight = 0.0

        for golden in golden_prompts:
            prompt_id = golden.get("id", str(uuid.uuid4()))
            prompt_text = golden["prompt"]
            expected = golden.get("expected_response")
            weight = golden.get("weight", 1.0)

            # Call target model
            try:
                messages = [{"role": "user", "content": prompt_text}]
                if test["model"].startswith("claude-"):
                    actual_response, pt, ct = _call_anthropic(test["model"], messages)
                else:
                    actual_response, pt, ct = _call_openai(test["model"], messages)

                total_tokens += pt + ct

                # Evaluate quality
                score, reasoning = _evaluate_response(
                    prompt=prompt_text,
                    response=actual_response,
                    expected_response=expected,
                    evaluator_model=test["evaluator_model"],
                )

                prompt_results.append({
                    "prompt_id": prompt_id,
                    "prompt": prompt_text[:500],
                    "response": actual_response[:2000],
                    "expected_response": (expected or "")[:500],
                    "score": score,
                    "weight": weight,
                    "evaluator_reasoning": reasoning,
                    "status": "success",
                })

                weighted_score_sum += score * weight
                total_weight += weight

            except Exception as e:
                logger.error(f"Failed to run prompt {prompt_id}: {e}")
                prompt_results.append({
                    "prompt_id": prompt_id,
                    "prompt": prompt_text[:500],
                    "response": None,
                    "score": 0,
                    "weight": weight,
                    "evaluator_reasoning": f"Error: {e}",
                    "status": "error",
                })

        # Compute overall score
        overall_score = (weighted_score_sum / total_weight) if total_weight > 0 else 0.0
        baseline_score = test.get("baseline_score")
        score_delta = (overall_score - baseline_score) if baseline_score is not None else None

        # If no baseline yet, set it
        if baseline_score is None:
            self.supabase.table("drift_tests").update(
                {"baseline_score": overall_score}
            ).eq("id", drift_test_id).execute()
            baseline_score = overall_score
            score_delta = 0.0

        # Check if alert should trigger
        threshold = project["quality_score_threshold"] if project else 7.0
        alert_triggered = overall_score < threshold

        # Store result
        result_record = {
            "id": str(uuid.uuid4()),
            "drift_test_id": drift_test_id,
            "project_id": test["project_id"],
            "run_at": datetime.now(timezone.utc).isoformat(),
            "overall_score": round(overall_score, 2),
            "baseline_score": round(baseline_score, 2) if baseline_score else None,
            "score_delta": round(score_delta, 2) if score_delta is not None else None,
            "prompt_results": prompt_results,
            "model_used": test["model"],
            "total_tokens_used": total_tokens,
            "alert_triggered": alert_triggered,
        }

        self.supabase.table("drift_test_results").insert(result_record).execute()

        # Update last_run info on test
        self.supabase.table("drift_tests").update({
            "last_run_at": result_record["run_at"],
            "last_score": round(overall_score, 2),
        }).eq("id", drift_test_id).execute()

        # Trigger alert if quality degraded
        if alert_triggered:
            self.alert_service.create_quality_alert(
                project_id=test["project_id"],
                test_name=test["name"],
                model=test["model"],
                score=overall_score,
                threshold=threshold,
                baseline=baseline_score,
            )

        logger.info(
            f"Drift test '{test['name']}' complete: score={overall_score:.2f} "
            f"(baseline={baseline_score:.2f}, threshold={threshold}) "
            f"alert={'YES' if alert_triggered else 'no'}"
        )

        return result_record

    def run_all_scheduled_tests(self, schedule: str = "daily") -> None:
        """Run all active drift tests with the given schedule."""
        tests = (
            self.supabase.table("drift_tests")
            .select("id, name")
            .eq("is_active", True)
            .eq("schedule", schedule)
            .execute()
        )

        for test in tests.data or []:
            try:
                self.run_drift_test(test["id"])
            except Exception as e:
                logger.error(f"Failed drift test {test['id']} ({test['name']}): {e}")

