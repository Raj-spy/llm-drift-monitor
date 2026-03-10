"""
LLM model pricing database.
Prices are in USD per 1M tokens.
Updated: 2025-01

Sources:
- OpenAI: https://openai.com/pricing
- Anthropic: https://www.anthropic.com/pricing
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class ModelPricing:
    provider: str
    input_per_million: float    # USD per 1M input tokens
    output_per_million: float   # USD per 1M output tokens
    context_window: int         # Max context in tokens


# Canonical model pricing table
PRICING: dict[str, ModelPricing] = {
    # ── OpenAI ──────────────────────────────────────────────────────
    "gpt-4o": ModelPricing(
        provider="openai",
        input_per_million=2.50,
        output_per_million=10.00,
        context_window=128_000,
    ),
    "gpt-4o-mini": ModelPricing(
        provider="openai",
        input_per_million=0.15,
        output_per_million=0.60,
        context_window=128_000,
    ),
    "gpt-4-turbo": ModelPricing(
        provider="openai",
        input_per_million=10.00,
        output_per_million=30.00,
        context_window=128_000,
    ),
    "gpt-4": ModelPricing(
        provider="openai",
        input_per_million=30.00,
        output_per_million=60.00,
        context_window=8_192,
    ),
    "gpt-3.5-turbo": ModelPricing(
        provider="openai",
        input_per_million=0.50,
        output_per_million=1.50,
        context_window=16_385,
    ),
    "o1": ModelPricing(
        provider="openai",
        input_per_million=15.00,
        output_per_million=60.00,
        context_window=200_000,
    ),
    "o1-mini": ModelPricing(
        provider="openai",
        input_per_million=3.00,
        output_per_million=12.00,
        context_window=128_000,
    ),
    # ── Anthropic ───────────────────────────────────────────────────
    "claude-opus-4-5": ModelPricing(
        provider="anthropic",
        input_per_million=15.00,
        output_per_million=75.00,
        context_window=200_000,
    ),
    "claude-sonnet-4-5": ModelPricing(
        provider="anthropic",
        input_per_million=3.00,
        output_per_million=15.00,
        context_window=200_000,
    ),
    "claude-3-5-sonnet-20241022": ModelPricing(
        provider="anthropic",
        input_per_million=3.00,
        output_per_million=15.00,
        context_window=200_000,
    ),
    "claude-3-5-haiku-20241022": ModelPricing(
        provider="anthropic",
        input_per_million=0.80,
        output_per_million=4.00,
        context_window=200_000,
    ),
    "claude-3-opus-20240229": ModelPricing(
        provider="anthropic",
        input_per_million=15.00,
        output_per_million=75.00,
        context_window=200_000,
    ),
    "claude-3-haiku-20240307": ModelPricing(
        provider="anthropic",
        input_per_million=0.25,
        output_per_million=1.25,
        context_window=200_000,
    ),
    # ── Google ──────────────────────────────────────────────────────
    "gemini-1.5-pro": ModelPricing(
        provider="google",
        input_per_million=3.50,
        output_per_million=10.50,
        context_window=2_000_000,
    ),
    "gemini-1.5-flash": ModelPricing(
        provider="google",
        input_per_million=0.075,
        output_per_million=0.30,
        context_window=1_000_000,
    ),
    # ── Groq-hosted models ───────────────────────────────────────────────────
    "llama-3.3-70b-versatile": ModelPricing(provider="groq", input_per_million=0.59,  output_per_million=0.79,  context_window=128_000),
    "llama-3.1-70b-versatile": ModelPricing(provider="groq", input_per_million=0.59,  output_per_million=0.79,  context_window=128_000),
    "llama-3.1-8b-instant":    ModelPricing(provider="groq", input_per_million=0.05,  output_per_million=0.08,  context_window=128_000),
    "llama3-70b-8192":         ModelPricing(provider="groq", input_per_million=0.59,  output_per_million=0.79,  context_window=8_192),
    "llama3-8b-8192":          ModelPricing(provider="groq", input_per_million=0.05,  output_per_million=0.08,  context_window=8_192),
    "mixtral-8x7b-32768":      ModelPricing(provider="groq", input_per_million=0.24,  output_per_million=0.24,  context_window=32_768),
    "gemma2-9b-it":            ModelPricing(provider="groq", input_per_million=0.20,  output_per_million=0.20,  context_window=8_192),
    "gemma-7b-it":             ModelPricing(provider="groq", input_per_million=0.07,  output_per_million=0.07,  context_window=8_192),
}

# Model name aliases (normalize variants)
MODEL_ALIASES: dict[str, str] = {
    "gpt-4o-2024-11-20": "gpt-4o",
    "gpt-4o-2024-08-06": "gpt-4o",
    "gpt-4-turbo-preview": "gpt-4-turbo",
    "claude-3-5-sonnet-latest": "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-latest": "claude-3-5-haiku-20241022",
}


def calculate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> Optional[float]:
    """
    Calculate the estimated cost of an LLM call in USD.

    Returns None if the model is not in the pricing database.
    """
    # Normalize model name
    canonical = MODEL_ALIASES.get(model, model)
    pricing = PRICING.get(canonical)

    if not pricing:
        return None

    input_cost = (prompt_tokens / 1_000_000) * pricing.input_per_million
    output_cost = (completion_tokens / 1_000_000) * pricing.output_per_million
    return round(input_cost + output_cost, 8)


def get_provider(model: str) -> str:
    """Detect provider from model name."""
    canonical = MODEL_ALIASES.get(model, model)
    pricing = PRICING.get(canonical)
    if pricing:
        return pricing.provider

    # Fallback heuristics
    if model.startswith("gpt-") or model.startswith("o1") or model.startswith("o3"):
        return "openai"
    if model.startswith("claude-"):
        return "anthropic"
    if model.startswith("gemini-"):
        return "google"
    if model.startswith("llama") or model.startswith("mixtral") or model.startswith("gemma"):
        return "groq"
    return "openai"