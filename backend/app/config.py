import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load .env from the backend directory
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)


def _require_env(name: str) -> str:
    """Return the value of an env var or raise at startup if missing."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Required environment variable '{name}' is not set. "
            f"Add it to {env_path} or export it before starting the server."
        )
    return value


# Supabase
SUPABASE_URL: str = _require_env("SUPABASE_URL")
SUPABASE_SERVICE_KEY: str = _require_env("SUPABASE_SERVICE_KEY")

# OpenAI
OPENAI_API_KEY: str = _require_env("OPEN_AI_API_KEY")

logger.info("Configuration loaded successfully.")
