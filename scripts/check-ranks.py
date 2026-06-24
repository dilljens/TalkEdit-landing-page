#!/usr/bin/env python3
"""
Google Search Console rank checker — free, scriptable, gives real Google data.
Usage:
  1. python3 scripts/setup-gsc.sh  (follow instructions)
  2. mv ~/Downloads/gsc-creds.json scripts/gsc-creds.json
  3. python3 scripts/check-ranks.py
"""

import json
import os
import sys
from datetime import datetime, timedelta

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CREDS_PATH = os.path.join(SCRIPT_DIR, "gsc-creds.json")

# ── Target keywords to track ─────────────────────────────────────────────
TARGET_KEYWORDS = [
    "talkedit",
    "talk edit",
    "descript alternative",
    "offline video editor",
    "text based video editor",
    "remove filler words from video",
    "offline ai video editor",
    "video editor for podcasters",
]

SITE_URL = "sc-domain:talk-edit.com"


def main():
    if not os.path.exists(CREDS_PATH):
        print(f"No credentials found at {CREDS_PATH}")
        print("Run scripts/setup-gsc.sh first to set up Google Search Console API access.")
        sys.exit(1)

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        print("Missing dependencies. Run:")
        print("  pip install google-auth google-api-python-client")
        sys.exit(1)

    creds = service_account.Credentials.from_service_account_file(
        CREDS_PATH,
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
    )
    service = build("searchconsole", "v1", credentials=creds)

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=28)).strftime("%Y-%m-%d")

    print(f"Search Console Report — talk-edit.com")
    print(f"Period: {start_date} to {end_date}")
    print(f"{'Keyword':<40} {'Clicks':<8} {'Impressions':<12} {'CTR':<8} {'Position':<8}")
    print("-" * 80)

    # Fetch all queries
    request = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["query"],
        "rowLimit": 100,
    }
    response = service.searchanalytics().query(siteUrl=SITE_URL, body=request).execute()

    rows = response.get("rows", [])
    tracked = {}
    for row in rows:
        query = row["keys"][0].lower()
        tracked[query] = {
            "clicks": row["clicks"],
            "impressions": row["impressions"],
            "ctr": row["ctr"],
            "position": row["position"],
        }

    # Show target keywords first
    for kw in TARGET_KEYWORDS:
        data = tracked.get(kw.lower())
        if data:
            print(f"{kw:<40} {data['clicks']:<8} {data['impressions']:<12} {data['ctr']*100:<8.1f}% {data['position']:<8.1f}")
        else:
            print(f"{kw:<40} {'—':<8} {'—':<12} {'—':<8} {'—':<8}")

    # Show other queries that drive traffic
    print(f"\n--- Other top queries (sorted by clicks) ---")
    all_sorted = sorted(rows, key=lambda r: r["clicks"], reverse=True)
    for row in all_sorted[:20]:
        query = row["keys"][0]
        if query.lower() not in [k.lower() for k in TARGET_KEYWORDS]:
            clicks = row["clicks"]
            impressions = row["impressions"]
            position = row["position"]
            print(f"{query:<40} {clicks:<8} {impressions:<12} {position:<8.1f}")


if __name__ == "__main__":
    main()
