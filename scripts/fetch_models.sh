#!/usr/bin/env bash
API_URL="http://localhost:20128/v1/models"
OUTPUT="models_raw.json"
API_FILE="api.txt"
DEFAULT_API_KEY=""
[ -n "$DEFAULT_API_KEY" ] && TOKEN="$DEFAULT_API_KEY"
if [ -z "$TOKEN" ] && [ -n "$1" ]; then TOKEN="$1"
elif [ -z "$TOKEN" ] && [ -f "$API_FILE" ]; then TOKEN=$(cat "$API_FILE" | tr -d '\r\n'); echo "Token from $API_FILE"
fi
if [ -z "$TOKEN" ]; then
    read -rp "Enter API Key: " TOKEN
    [ -z "$TOKEN" ] && echo "ERROR: API key required." && exit 1
fi
echo "Fetching from $API_URL ..."
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL" -o "$OUTPUT"
[ $? -ne 0 ] && echo "ERROR: Fetch failed." && rm -f "$OUTPUT" && exit 1
echo "Saved to $OUTPUT"
