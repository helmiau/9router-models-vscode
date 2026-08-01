#!/usr/bin/env bash
# 9Router Bridge - localhost relay + auto-install chatLanguageModels.json
set -e
cd "$(dirname "$0")/.."

if command -v python3 >/dev/null 2>&1; then PY=python3; else PY=python; fi
if ! command -v "$PY" >/dev/null 2>&1; then
    echo "[ERROR] Python not found in PATH." >&2
    exit 1
fi

exec "$PY" scripts/bridge.py "$@"
