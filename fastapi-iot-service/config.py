import os
from pathlib import Path
from dotenv import load_dotenv

# Search for .env in current folder, or fallback to ../backend/.env
current_dir = Path(__file__).resolve().parent
local_env = current_dir / ".env"
backend_env = current_dir.parent / "backend" / ".env"

if backend_env.exists():
    load_dotenv(backend_env)

if local_env.exists():
    load_dotenv(local_env, override=True)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
HOST = os.getenv("HOST", "0.0.0.0")
# FastAPI IoT service runs on port 8000 (Express backend uses port 5000)
PORT = int(os.getenv("FASTAPI_PORT") or os.getenv("IOT_PORT") or "8000")
DEBUG = os.getenv("DEBUG", "true").lower() in ("true", "1")

# Telemetry threshold settings
ALERT_DECIBEL_THRESHOLD = float(os.getenv("ALERT_DECIBEL_THRESHOLD", "82.0"))
ALERT_CONFIDENCE_THRESHOLD = float(os.getenv("ALERT_CONFIDENCE_THRESHOLD", "0.80"))

# Default primary node for College Garden
DEFAULT_NODE_UID = os.getenv("DEFAULT_NODE_UID", "DGN-NODE-67SF-608")

# OpenAI API Key for Multi-Modal AI Agents (Audio & Vision)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("API", "").strip()
