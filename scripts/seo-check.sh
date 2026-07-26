#!/usr/bin/env bash
set -euo pipefail
# SEO Health Check — talk-edit.com
# Usage: bash scripts/seo-check.sh
# Requires: curl, npx (for linkinator). No API keys needed.

SITE="https://talk-edit.com"
FAILED=0

echo "════════════════════════════════════════════"
echo "  SEO Health Check — talk-edit.com"
echo "  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "════════════════════════════════════════════"

# ── 1. Sitemap ────────────────────────────────────────────────────────────
echo ""
echo "─── 1. Sitemap ───"
SITEMAP="$SITE/sitemap.xml"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITEMAP")
echo "  HTTP $STATUS"
if [ "$STATUS" != "200" ]; then echo "  ❌ Sitemap unreachable"; FAILED=1; fi

# Check no fragment URLs
FRAGS=$(curl -s "$SITEMAP" | grep -c '#')
if [ "$FRAGS" -gt 0 ]; then echo "  ❌ Fragment URLs in sitemap: $FRAGS"; FAILED=1
else echo "  ✅ No fragment URLs"; fi

# Check all URLs resolve
URLS=$(curl -s "$SITEMAP" | grep -oP '<loc>\K[^<]+')
COUNT=$(echo "$URLS" | wc -l)
echo "  📄 $COUNT URLs in sitemap"
BROKEN=0
while IFS= read -r url; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$url")
  if [ "$CODE" != "200" ]; then
    echo "  ❌ $url -> $CODE"
    BROKEN=1
  fi
done <<< "$URLS"
if [ "$BROKEN" -eq 0 ]; then echo "  ✅ All sitemap URLs resolve to 200"; fi

# ── 2. robots.txt ─────────────────────────────────────────────────────────
echo ""
echo "─── 2. robots.txt ───"
ROBOTS="$SITE/robots.txt"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ROBOTS")
echo "  HTTP $STATUS"
if [ "$STATUS" = "200" ]; then
  HAS_SITE=$(curl -s "$ROBOTS" | grep -c "Sitemap:" || true)
  if [ "$HAS_SITE" -ge 1 ]; then echo "  ✅ Sitemap referenced in robots.txt"
  else echo "  ⚠️ No Sitemap directive in robots.txt"; fi
else echo "  ❌ robots.txt unreachable"; FAILED=1; fi

# ── 3. Broken links ───────────────────────────────────────────────────────
echo ""
echo "─── 3. Broken Links ───"
if command -v npx &>/dev/null; then
  npx linkinator "$SITE" --recurse --skip "mailto:|cdn.tailwindcss.com|fonts.googleapis.com|fonts.gstatic.com" 2>&1 | grep -E "BROKEN|ERROR|Passed|Scanned" || echo "  ⚠️ linkinator output unavailable"
else
  echo "  ⚠️ npx not found — install Node.js or run: npm install -g linkinator"
fi

# ── 4. Page checks ───────────────────────────────────────────────────────
echo ""
echo "─── 4. Page Checks ───"
PAGES=(
  "/"
  "/vs/descript/"
  "/blog/text-based-video-editing-guide/"
  "/blog/best-offline-ai-video-editors/"
  "/blog/remove-filler-words-podcast/"
)
for page in "${PAGES[@]}"; do
  URL="$SITE$page"
  HTML=$(curl -s -L "$URL" 2>/dev/null || echo "")

  if [ -z "$HTML" ]; then
    echo "  ❌ $URL — unreachable"
    FAILED=1
    continue
  fi

  TITLE=$(echo "$HTML" | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g' | head -1)
  DESC=$(echo "$HTML" | grep -o '<meta name="description" content="[^"]*"' | sed 's/.*content="\([^"]*\)".*/\1/' | head -1)
  H1=$(echo "$HTML" | grep -oP '<h1[^>]*>\K[^<]+' | head -1)
  CANON=$(echo "$HTML" | grep -oP '<link rel="canonical" href="\K[^"]+' | head -1)
  JSON=$(echo "$HTML" | grep -c 'application/ld+json' || true)

  echo "  📄 $page"
  echo "    Title:   ${TITLE:0:70}"
  echo "    Desc:    ${DESC:0:70}"
  echo "    H1:      ${H1:0:60}"
  echo "    Canon:   $CANON"
  echo "    JSON-LD: $JSON blocks"

  # Title length check
  TL=${#TITLE}
  if [ "$TL" -gt 60 ]; then echo "    ⚠️  Title long ($TL chars, max 60)"
  elif [ "$TL" -ge 20 ]; then echo "    ✅ Title $TL chars"
  else echo "    ⚠️  Title short ($TL chars)"; fi

  # Description check
  DL=${#DESC}
  if [ "$DL" -gt 160 ]; then echo "    ⚠️  Description long ($DL chars)"
  elif [ "$DL" -ge 50 ]; then echo "    ✅ Description $DL chars"
  else echo "    ⚠️  Description short ($DL chars)"; fi

  # H1 check
  if [ -z "$H1" ]; then echo "    ❌ Missing H1"; FAILED=1; fi

  # Canonical matches URL
  if [ "$CANON" != "$URL" ] && [ "$CANON" != "${SITE}/" ]; then
    echo "    ❌ Canonical mismatch: expected $URL"
    FAILED=1
  else
    echo "    ✅ Canonical matches URL"
  fi
done

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then echo "  ✅ All SEO checks passed!"
else echo "  ❌ Some checks failed — review above"; fi
echo "════════════════════════════════════════════"
exit $FAILED
