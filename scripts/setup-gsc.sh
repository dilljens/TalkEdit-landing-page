#!/usr/bin/env bash
set -euo pipefail
# Google Search Console API setup guide.
# This script doesn't run anything — it prints step-by-step instructions.
# GSC API is free and gives you your actual ranking data programmatically.

cat <<INSTRUCTIONS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Google Search Console API — Free Setup
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Enable the API
  Go to: https://console.cloud.google.com/apis/library/
  Search for: "Google Search Console API"
  Click: Enable

Step 2: Create credentials
  Go to: https://console.cloud.google.com/apis/credentials
  Click: "Create Credentials" → "Service Account"
  Name: "seo-bot"
  Role: "Project → Viewer" (or skip role selection)
  Click: "Done"
  
  Click on the new service account → "Keys" tab → "Add Key" → "Create New Key"
  Choose: JSON
  Save the downloaded file as: scripts/gsc-creds.json

Step 3: Add the service account to Search Console
  Go to: https://search.google.com/search-console
  Open your property (talk-edit.com)
  Go to: Settings → Users and permissions → Add user
  Paste the service account email (from the JSON file: client_email)
  Permission: "Full" or "Restricted" (read-only is fine)

Step 4: Run the rank checker
  pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
  python3 scripts/check-ranks.py

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  You'll then have your real Google ranking data
  scriptable from any Python script.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS
