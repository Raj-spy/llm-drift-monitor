#!/usr/bin/env python3
"""
Monthly request counter reset.
Schedule via cron: 0 0 1 * * python scripts/monthly_reset.py
Or add to APScheduler in main.py.
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

result = sb.table("users").update({"requests_this_month": 0}).neq("id", "").execute()
print(f"Reset request counters for {len(result.data)} users")
