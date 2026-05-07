#!/usr/bin/env bash
set -e
xdg-open index.html 2>/dev/null || open index.html 2>/dev/null || echo "Open index.html in your browser"
