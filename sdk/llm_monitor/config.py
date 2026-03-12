"""Configuration for LLM Monitor SDK."""
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class MonitorConfig:
    """
    Configuration for the LLM Monitor SDK.

    Can be set via constructor or environment variables.
    Environment variables take precedence.
    """
    # Required
    api_key: str = field(
        default_factory=lambda: os.environ.get("LLM_MONITOR_API_KEY", "")
    )

    # Backend endpoint
    backend_url: str = field(
        default_factory=lambda: os.environ.get(
            "LLM_MONITOR_BACKEND_URL", "https://api.llmdriftmonitor.com"
        )
    )

    # Project identification
    project_id: Optional[str] = field(
        default_factory=lambda: os.environ.get("LLM_MONITOR_PROJECT_ID")
    )

    # Batching settings
    batch_size: int = 50           # Max events per batch
    flush_interval: float = 0.5   # Seconds between auto-flushes
    max_queue_size: int = 1000    # Drop events if queue exceeds this

    # Content capture
    capture_prompt: bool = True    # Capture prompt text
    capture_response: bool = True  # Capture response text
    max_prompt_chars: int = 10000  # Truncate long prompts
    max_response_chars: int = 10000

    # Behavior
    raise_on_error: bool = False   # If True, SDK errors propagate
    debug: bool = field(
        default_factory=lambda: os.environ.get("LLM_MONITOR_DEBUG", "").lower() == "true"
    )

    # Timeout for backend calls
    timeout_seconds: float = 5.0

    def validate(self) -> None:
        if not self.api_key:
            raise ValueError(
                "LLM Monitor API key is required. "
                "Set LLM_MONITOR_API_KEY env var or pass api_key= to configure()"
            )
        if not self.project_id:
            raise ValueError(
                "Project ID is required. "
                "Set LLM_MONITOR_PROJECT_ID env var or pass project_id= to configure()"
            )
