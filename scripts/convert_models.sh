#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
INPUT="${1:-models_raw.json}"
OUTPUT="${2:-chatLanguageModels.json}"
[ ! -f "$INPUT" ] && echo "ERROR: $INPUT not found." && exit 1
python3 "$DIR/convert_models.py" "$INPUT" "$OUTPUT" 2>/dev/null || {
    echo "ERROR: Python3 required. Install python3 first."
    exit 1
}
