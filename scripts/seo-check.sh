#!/usr/bin/env bash
set -euo pipefail
# SEO Health Check — talk-edit.com
# Runs: broken link check, page speed audit, meta tag validation, sitemap check.
# Usage: bash scripts/seo-check.sh             (checks production site)
#        bash scripts/seo-check.sh --dev        (checks local files)
#        bash scripts/seo-check.sh --ci         (returns exit code for CI)

SITE="https://talk-edit.com"
MODE="${1:-}"
FAILED=0
PAGES=(
  "/"
  "/vs/descript"
  "/blog/text-based-video-editing-guide"
  "/blog/best-offline-ai-video-editors"
  "/blog/remove-filler-words-podcast"
)

echo "════════════════════════════════════════════"
echo "  SEO Health Check — $SITE"
echo "  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "════════════════════════════════════════════"
echo ""

# ── 1. Sitemap validation ───────────────────────────────────────────────
echo "─── 1. Sitemap ───"
SITEMAP="$SITE/sitemap.xml"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SITEMAP" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  ✅ $SITEMAP ($STATUS)"
  # Check no fragment URLs
  FRAGS=$(curl -s "$SITEMAP" | grep -c '#')
  if [ "$FRAGS" -gt 0 ]; then
    echo "  ❌ Found $FRAGS fragment URLs in sitemap"
    FAILED=1
  else
    echo "  ✅ No fragment URLs"
  fi
  # Count URLs
  URL_COUNT=$(curl -s "$SITEMAP" | grep -c '<loc>')
  echo "  📄 $URL_COUNT URLs listed"
else
  echo "  ❌ $SITEMAP returned $STATUS"
  FAILED=1
fi

# ── 2. Broken links ──────────────────────────────────────────────────────
echo ""
echo "─── 2. Broken Links ───"
if command -v npx &>/dev/null; then
  npx linkinator "$SITE" --recurse --skip "mailto:|cdn.tailwindcss.com|fonts.googleapis.com|fonts.gstatic.com" 2>&1 | {
    BROKEN=0
    STATUS_LINE=""
    while IFS= read -r line; do
      STATUS_LINE="$line"
      if echo "$line" | grep -q "BROKEN\|ERROR"; then
        BROKEN=$((BROKEN + 1))
        echo "  ❌ $line"
      fi
    done
    if [ "$BROKEN" -eq 0 ]; then
      echo "  ✅ No broken links found"
      echo "  📊 $STATUS_LINE"
    else
      FAILED=1
    fi
  }
else
  echo "  ⚠️ npx not available — install Node.js or run: npm install -g linkinator"
fi

# ── 3. Page-level checks ─────────────────────────────────────────────────
echo ""
echo "─── 3. Page Checks ───"
for page in "${PAGES[@]}"; do
  URL="$SITE$page"
  HTML=$(curl -s "$URL" 2>/dev/null || echo "")
  if [ -z "$HTML" ]; then
    echo "  ❌ $URL — unreachable"
    FAILED=1
    continue
  fi

  TITLE=$(echo "$HTML" | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g' | head -1)
  DESC=$(echo "$HTML" | grep -o '<meta name="description" content="[^"]*"' | sed 's/.*content="\([^"]*\)".*/\1/' | head -1 || echo "MISSING")
  H1=$(echo "$HTML" | grep -o '<h1[^>]*>[^<]*</h1>' | sed 's/<[^>]*>//g' | head -1 || echo "MISSING")
  CANON=$(echo "$HTML" | grep -o '<link rel="canonical" href="[^"]*"' | sed 's/.*href="\([^"]*\)".*/\1/' | head -1 || echo "MISSING")
  JSON_COUNT=$(echo "$HTML" | grep -c 'application/ld+json' || true)

  echo "  📄 $URL"
  echo "    Title:      ${TITLE:0:70}"
  echo "    Description: ${DESC:0:70}"
  echo "    H1:         ${H1:0:70}"
  echo "    Canonical:  $CANON"
  echo "    JSON-LD:    $JSON_COUNT blocks"

  # Validate title length
  TITLE_LEN=${#TITLE}
  if [ "$TITLE_LEN" -gt 60 ]; then
    echo "    ⚠️  Title too long ($TITLE_LEN chars, max 60)"
  elif [ "$TITLE_LEN" -lt 20 ]; then
    echo "    ⚠️  Title too short ($TITLE_LEN chars, min 20)"
  else
    echo "    ✅ Title length $TITLE_LEN"
  fi

  # Validate description length
  DESC_LEN=${#DESC}
  if [ "$DESC_LEN" -gt 160 ]; then
    echo "    ⚠️  Description too long ($DESC_LEN chars, max 160)"
  elif [ "$DESC_LEN" -lt 50 ]; then
    echo "    ⚠️  Description short ($DESC_LEN chars)"
  else
    echo "    ✅ Description length $DESC_LEN"
  fi

  # Check H1 exists
  if [ "$H1" = "MISSING" ]; then
    echo "    ❌ Missing H1"
    FAILED=1
  fi

  # Check canonical matches URL
  EXPECTED_CANON="$SITE$page"
  if [ "$CANON" != "$EXPECTED_CANON" ] && [ "$CANON" != "$SITE/" ]; then
    echo "    ⚠️  Canonical mismatch: expected $EXPECTED_CANON"
  fi

  # Check HTTPS
  if ! echo "$HTML" | grep -q 'href="http://'; then
    echo "    ✅ No mixed content (no http:// links)"
  else
    echo "    ❌ Mixed content detected (http:// links found)"
    FAILED=1
  fi
done

# ── 4. robots.txt check ──────────────────────────────────────────────────
echo ""
echo "─── 4. robots.txt ───"
ROBOTS="$SITE/robots.txt"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ROBOTS" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "  ✅ $ROBOTS ($STATUS)"
  SITEMAP_IN_ROBOTS=$(curl -s "$ROBOTS" | grep -c "Sitemap:" || true)
  if [ "$SITEMAP_IN_ROBOTS" -ge 1 ]; then
    echo "  ✅ Sitemap referenced in robots.txt"
  else
    echo "  ⚠️ No Sitemap directive in robots.txt"
  fi
else
  echo "  ❌ $ROBOTS returned $STATUS"
fi

# ── 5. PageSpeed (if API key set) ───────────────────────────────────────
if [ -n "${PAGESPEED_API_KEY:-}" ]; then
  echo ""
  echo "─── 5. PageSpeed ───"
  for page in "${PAGES[@]}"; do
    URL="$SITE$page"
    echo "  🚀 $URL"
    DATA=$(curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=$URL&key=$PAGESPEED_API_KEY&strategy=mobile" 2>/dev/null || echo "")
    SCORE=$(echo "$DATA" | grep -o '"score":[0-9]*' | head -1 | cut -d: -f2 || echo "N/A")
    if [ "$SCORE" != "N/A" ] && [ "$SCORE" -lt 80 ]; then
      echo "    ❌ Performance: $SCORE (target: 80+)"
      FAILED=1
    elif [ "$SCORE" != "N/A" ]; then
      echo "    ✅ Performance: $SCORE"
    else
      echo "    ⚠️  Could not fetch PageSpeed (check API key)"
    fi
  done
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  echo "  ✅ All SEO checks passed!"
else
  echo "  ❌ Some checks failed — review above"
fi
echo "════════════════════════════════════════════"
exit $FAILED
