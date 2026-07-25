#!/usr/bin/env python3
"""Fetch models from 9Router and convert to chatLanguageModels.json"""
import sys, json, os, urllib.request, urllib.error

API_URL = "http://localhost:20128/v1/models"
OUTPUT_FILE = "chatLanguageModels.json"
API_FILE = "api.txt"
DEFAULT_API_KEY = ""

# Token: DEFAULT_API_KEY (web form) > CLI arg > api.txt > prompt
# Used for both: auth header (fetch) and apiKey (output JSON)
if DEFAULT_API_KEY:
    token = DEFAULT_API_KEY
elif len(sys.argv) >= 2:
    token = sys.argv[1]
elif os.path.exists(API_FILE):
    token = open(API_FILE).read().strip()
    print(f"Token from {API_FILE}")
else:
    token = input("Enter API Key: ").strip()
    if not token:
        sys.exit("ERROR: API key required")

print(f"Fetching from {API_URL} ...")
req = urllib.request.Request(API_URL, headers={
    "Authorization": f"Bearer {token}",
    "Accept": "application/json"
})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = json.loads(resp.read().decode())
except urllib.error.URLError as e:
    sys.exit(f"ERROR: Cannot connect to {API_URL}\n{e}\nMake sure 9Router is running.")

models = []
seen = set()
for m in raw.get("data", []):
    mid = m.get("id", "")
    if mid in seen: continue
    seen.add(mid)
    cap = m.get("capabilities") or {}
    models.append({"id":mid,"name":mid,"url":"http://localhost:20128/v1",
        "toolCalling":bool(cap.get("tools")),
        "vision":bool(cap.get("vision")),
        "maxInputTokens":cap.get("contextWindow",128000),
        "maxOutputTokens":cap.get("maxOutput",64000)})

result = [{"name":"9Router","vendor":"customendpoint",
    "apiKey":DEFAULT_API_KEY or "${input:chat.lm.secret.-65d90303}",
    "apiType":"chat-completions","models":models}]
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(result, f, indent="\t", ensure_ascii=False)
    f.write("\n")
print(f"Done! Total: {len(models)} models")
