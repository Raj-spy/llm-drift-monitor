"""
llm_monitor — Python SDK for LLM Cost & Quality Drift Monitor
Zero-overhead LLM observability. Drop-in wrapper for OpenAI and Anthropic.
"""

from .monitor import LLMMonitor
from .config import MonitorConfig

# Default global monitor instance (configure once, use everywhere)
monitor = LLMMonitor()

__version__ = "0.1.0"
__all__ = ["monitor", "LLMMonitor", "MonitorConfig"]
