#!/usr/bin/env python3
"""
Backend setup script.
Run once after configuring .env to:
  1. Verify Supabase connection
  2. Create a first admin user
  3. Create a demo project + API key
  4. Print the SDK quickstart snippet

Usage:
    cd backend
    python scripts/setup.py
"""
import os
import sys
import uuid
import secrets
import hashlib

# Load .env
from pathlib import Path
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or "your-project" in SUPABASE_URL:
    print("❌  SUPABASE_URL not set. Edit backend/.env first.")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("❌  supabase not installed. Run: pip install -r requirements.txt")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def check_connection():
    try:
        sb.table("users").select("id").limit(1).execute()
        print("✅  Supabase connection OK")
    except Exception as e:
        print(f"❌  Supabase connection failed: {e}")
        print("    → Make sure you ran docs/schema.sql in the Supabase SQL Editor")
        sys.exit(1)


def generate_api_key():
    raw = secrets.token_urlsafe(32)
    full_key = f"lmd_{raw}"
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()
    key_prefix = full_key[:12]
    return full_key, key_hash, key_prefix


def seed_demo_data(user_email: str):
    """Create a demo project and API key for the given user."""
    # Find user
    user_res = sb.table("users").select("*").eq("email", user_email).maybe_single().execute()
    if not user_res.data:
        print(f"❌  User '{user_email}' not found. Sign up in the dashboard first.")
        return

    user = user_res.data
    user_id = user["id"]
    print(f"✅  Found user: {user_email} (id={user_id[:8]}...)")

    # Create project
    project_id = str(uuid.uuid4())
    slug = f"demo-project-{secrets.token_hex(3)}"
    sb.table("projects").insert({
        "id": project_id,
        "owner_id": user_id,
        "name": "Demo Project",
        "description": "Auto-created demo project",
        "slug": slug,
        "environment": "development",
        "default_model": "gpt-4o",
        "alert_email": user_email,
    }).execute()
    print(f"✅  Created project: 'Demo Project' (id={project_id[:8]}...)")

    # Create API key
    full_key, key_hash, key_prefix = generate_api_key()
    key_id = str(uuid.uuid4())
    sb.table("api_keys").insert({
        "id": key_id,
        "project_id": project_id,
        "owner_id": user_id,
        "name": "Default Key",
        "key_hash": key_hash,
        "key_prefix": key_prefix,
    }).execute()
    print(f"✅  Created API key: {key_prefix}...")

    # Create a sample drift test
    drift_id = str(uuid.uuid4())
    sb.table("drift_tests").insert({
        "id": drift_id,
        "project_id": project_id,
        "name": "Summarization Quality",
        "model": "gpt-4o",
        "evaluator_model": "claude-3-5-haiku-20241022",
        "schedule": "daily",
        "golden_prompts": [
            {
                "id": str(uuid.uuid4()),
                "prompt": "Summarize the following in 2 sentences: The Apollo 11 mission was the first crewed lunar landing, landing on July 20, 1969. Neil Armstrong and Buzz Aldrin walked on the Moon while Michael Collins orbited above.",
                "expected_response": "Apollo 11 was the first crewed Moon landing on July 20, 1969. Neil Armstrong and Buzz Aldrin walked on the lunar surface while Michael Collins orbited above.",
                "weight": 1.0,
            },
            {
                "id": str(uuid.uuid4()),
                "prompt": "Translate to French: Hello, how are you today?",
                "expected_response": "Bonjour, comment allez-vous aujourd'hui ?",
                "weight": 1.0,
            },
        ],
    }).execute()
    print(f"✅  Created drift test: 'Summarization Quality'")

    print("\n" + "═" * 60)
    print("🚀  QUICKSTART")
    print("═" * 60)
    print(f"""
pip install llm-monitor

from llm_monitor import monitor

monitor.configure(
    api_key="{full_key}",
    project_id="{project_id}",
)

response = monitor.chat(
    model="gpt-4o",
    messages=[{{"role": "user", "content": "Hello!"}}],
)
print(response.choices[0].message.content)
""")
    print("═" * 60)
    print(f"📊  Dashboard: http://localhost:3000")
    print(f"📖  API Docs:  http://localhost:8000/docs")
    print(f"🔑  API Key:   {full_key}")
    print(f"📁  Project:   {project_id}")
    print("═" * 60)


if __name__ == "__main__":
    print("\n🔧  LLM Drift Monitor — Setup\n")
    check_connection()

    email = input("\nEnter your account email (sign up at http://localhost:3000 first): ").strip()
    if not email or "@" not in email:
        print("❌  Invalid email")
        sys.exit(1)

    seed_demo_data(email)
