"""
LLM quality tests using DeepEval (LLM-as-a-judge).

Provider is picked automatically:
  GROQ_API_KEY set       -> Groq (target model + judge)
  ANTHROPIC_API_KEY set  -> Claude (target model + judge)
  EVAL_FAKE=1            -> canned answers + rule-based fake judge (wiring check only,
                            says NOTHING about real model quality)
  none of the above      -> tests are skipped (so the normal CI test job never breaks)

Env vars (optional): EVAL_TARGET_MODEL, EVAL_JUDGE_MODEL
Defaults: groq -> openai/gpt-oss-120b, anthropic -> claude-haiku-5-5
"""
import json
import os

import pytest

pytest.importorskip("deepeval")
from deepeval.metrics import GEval  # noqa: E402
from deepeval.models import DeepEvalBaseLLM  # noqa: E402
from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # noqa: E402

GROQ_KEY = os.getenv("GROQ_API_KEY")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

if GROQ_KEY:
    PROVIDER = "groq"
    DEFAULT_MODEL = "openai/gpt-oss-120b"
elif ANTHROPIC_KEY:
    PROVIDER = "anthropic"
    DEFAULT_MODEL = "claude-haiku-5-5"
elif os.getenv("EVAL_FAKE") == "1":
    PROVIDER = "fake"
    DEFAULT_MODEL = "fake"
else:
    PROVIDER = None
    DEFAULT_MODEL = ""

TARGET_MODEL = os.getenv("EVAL_TARGET_MODEL", DEFAULT_MODEL)
JUDGE_MODEL = os.getenv("EVAL_JUDGE_MODEL", DEFAULT_MODEL)
THRESHOLD = 0.6

pytestmark = pytest.mark.skipif(
    PROVIDER is None,
    reason="Set GROQ_API_KEY or ANTHROPIC_API_KEY (real run), or EVAL_FAKE=1 (wiring check only)",
)

GOLDEN = [
    ("capital-france", "What is the capital of France?",
     "The capital of France is Paris."),
    ("kubernetes-definition", "Explain what Kubernetes is in two sentences.",
     "Kubernetes is an open-source platform that automates deploying, scaling and managing containerized applications across a cluster of machines."),
    ("http-404", "What does HTTP status code 404 mean?",
     "404 means Not Found: the server could not find the requested resource."),
    ("python-square", "Write a Python function that returns the square of a number.",
     "def square(x):\n    return x * x"),
    ("process-vs-thread", "What is the difference between a process and a thread?",
     "A process is an independent program instance with its own memory space; threads are lightweight units of execution inside a process that share its memory."),
]
FAKE_ANSWERS = {prompt: expected for _, prompt, expected in GOLDEN}


def chat(model: str, prompt: str, max_tokens: int = 1024) -> str:
    """One-shot chat call on whichever provider is active."""
    if PROVIDER == "groq":
        from groq import Groq
        r = Groq(api_key=GROQ_KEY).chat.completions.create(
            model=model, max_tokens=max_tokens, temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        return r.choices[0].message.content or ""
    import anthropic
    r = anthropic.Anthropic(api_key=ANTHROPIC_KEY).messages.create(
        model=model, max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return r.content[0].text


class JudgeLLM(DeepEvalBaseLLM):
    """Real LLM (Groq or Claude) used as DeepEval's judge instead of the default OpenAI."""

    def __init__(self, model: str):
        self._model = model

    def load_model(self):
        return self._model

    def generate(self, prompt: str, *args, **kwargs) -> str:
        return chat(self._model, prompt)

    async def a_generate(self, prompt: str, *args, **kwargs) -> str:
        return self.generate(prompt)

    def get_model_name(self) -> str:
        return f"{PROVIDER}:{self._model}"


class FakeJudge(DeepEvalBaseLLM):
    """Rule-based judge for offline wiring checks. Not a real quality signal."""

    def load_model(self):
        return None

    def generate(self, prompt: str, *args, **kwargs) -> str:
        bad = "Berlin" in prompt
        return json.dumps({"score": 2 if bad else 9, "reason": "fake judge"})

    async def a_generate(self, prompt: str, *args, **kwargs) -> str:
        return self.generate(prompt)

    def get_model_name(self) -> str:
        return "fake-judge"


def ask_target(prompt: str) -> str:
    if PROVIDER == "fake":
        return FAKE_ANSWERS[prompt]
    return chat(TARGET_MODEL, prompt, max_tokens=512)


@pytest.fixture(scope="module")
def judge():
    return FakeJudge() if PROVIDER == "fake" else JudgeLLM(JUDGE_MODEL)


def correctness_metric(judge):
    return GEval(
        name="Correctness",
        criteria="Is the actual output factually correct and consistent with the expected output?",
        evaluation_steps=[
            "Compare the actual output with the expected output for factual accuracy.",
            "Penalize heavily any factual contradiction with the expected output.",
            "Ignore differences in wording or length if the meaning is the same.",
        ],
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT, LLMTestCaseParams.EXPECTED_OUTPUT],
        threshold=THRESHOLD,
        model=judge,
    )


def relevancy_metric(judge):
    return GEval(
        name="Relevancy",
        criteria="Does the actual output directly address the input question?",
        evaluation_steps=[
            "Check whether the actual output answers what the input asked.",
            "Penalize off-topic content or refusing to answer.",
        ],
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        threshold=THRESHOLD,
        model=judge,
    )


@pytest.mark.parametrize("name,prompt,expected", GOLDEN, ids=[g[0] for g in GOLDEN])
def test_golden_prompt_quality(name, prompt, expected, judge):
    case = LLMTestCase(input=prompt, actual_output=ask_target(prompt), expected_output=expected)
    for metric in (correctness_metric(judge), relevancy_metric(judge)):
        metric.measure(case)
        assert metric.score >= THRESHOLD, (
            f"{metric.name} {metric.score:.2f} < {THRESHOLD}: {metric.reason}"
        )


def test_evaluator_catches_a_wrong_answer(judge):
    """Negative control: a clearly wrong answer must score below threshold."""
    case = LLMTestCase(
        input="What is the capital of France?",
        actual_output="The capital of France is Berlin.",
        expected_output="The capital of France is Paris.",
    )
    metric = correctness_metric(judge)
    metric.measure(case)
    assert metric.score < THRESHOLD, f"Judge failed to flag a wrong answer (score={metric.score:.2f})"
