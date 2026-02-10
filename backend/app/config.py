import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend directory
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

# Supabase
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")

# OpenAI
OPENAI_API_KEY: str = os.getenv("OPEN_AI_API_KEY", "")
