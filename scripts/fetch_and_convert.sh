#!/usr/bin/env bash
API_URL="http://localhost:20128/v1/models"
OUTPUT_FILE="chatLanguageModels.json"
TEMP_FILE="models_raw.json"
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
curl -s -H "Authorization: Bearer $TOKEN" "$API_URL" -o "$TEMP_FILE"
[ $? -ne 0 ] && echo "ERROR: Fetch failed." && rm -f "$TEMP_FILE" && exit 1
grep -q '"object".*"list"' "$TEMP_FILE" || { echo "ERROR: Invalid response." && cat "$TEMP_FILE" && rm -f "$TEMP_FILE" && exit 1; }
echo "Fetch OK. Converting..."
python3 - "$TEMP_FILE" "$OUTPUT_FILE" <<'PYEOF'
import json, sys
raw = json.load(open(sys.argv[1],"r",encoding="utf-8"))
DEFAULT_API_KEY = "\${input:chat.lm.secret.-65d90303}"
models = []; seen = set(); mx_i = 128000; mx_o = 64000
for m in raw.get("data",[]):
    if m.get("owned_by") == "combo": continue
    c = m.get("capabilities") or {}
    if c.get("contextWindow",0) > mx_i: mx_i = c["contextWindow"]
    if c.get("maxOutput",0) > mx_o: mx_o = c["maxOutput"]
for m in raw.get("data",[]):
    mid = m.get("id","")
    if mid in seen: continue
    seen.add(mid)
    ic = m.get("owned_by") == "combo"
    c = m.get("capabilities") or {}
    models.append({"id":mid,"name":mid,"url":"http://localhost:20128/v1","toolCalling":True if ic else bool(c.get("tools")),"vision":True if ic else bool(c.get("vision")),"maxInputTokens":mx_i if ic else c.get("contextWindow",128000),"maxOutputTokens":mx_o if ic else c.get("maxOutput",64000)})
R = [{"name":"9Router","vendor":"customendpoint","apiKey":DEFAULT_API_KEY,"apiType":"chat-completions","models":models}]
json.dump(R, open(sys.argv[2],"w",encoding="utf-8"), indent="\t", ensure_ascii=False)
print(f"Done! Total: {len(models)} models")
PYEOF
rm -f "$TEMP_FILE"
[ -z "$1" ] && read -rp "Press Enter to exit..."
