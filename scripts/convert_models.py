#!/usr/bin/env python3
"""Convert models_raw.json to chatLanguageModels.json"""
import json, sys, os

INPUT = sys.argv[1] if len(sys.argv) >= 2 else "models_raw.json"
OUTPUT = sys.argv[2] if len(sys.argv) >= 3 else "chatLanguageModels.json"
BASE_URL = "http://localhost:20128/v1"
DEFAULT_API_KEY = "\${input:chat.lm.secret.-65d90303}"

if not os.path.exists(INPUT):
    sys.exit(f"ERROR: {INPUT} not found. Run the fetch script first.")

with open(INPUT, "r", encoding="utf-8") as f:
    raw = json.load(f)
if raw.get("object") != "list":
    sys.exit(f"ERROR: Expected object=list, got {raw.get('object')}")

models = []
seen = set()
max_input = 128000
max_output = 64000
for m in raw.get("data", []):
    if m.get("owned_by") == "combo": continue
    cap = m.get("capabilities") or {}
    if cap.get("contextWindow", 0) > max_input: max_input = cap["contextWindow"]
    if cap.get("maxOutput", 0) > max_output: max_output = cap["maxOutput"]
for m in raw.get("data", []):
    mid = m.get("id", "")
    if mid in seen: continue
    seen.add(mid)
    is_combo = m.get("owned_by") == "combo"
    cap = m.get("capabilities") or {}
    models.append({"id":mid,"name":mid,"url":BASE_URL,
        "toolCalling":True if is_combo else bool(cap.get("tools")),
        "vision":True if is_combo else bool(cap.get("vision")),
        "maxInputTokens":max_input if is_combo else cap.get("contextWindow",128000),
        "maxOutputTokens":max_output if is_combo else cap.get("maxOutput",64000)})

result = [{"name":"9Router","vendor":"customendpoint",
    "apiKey":DEFAULT_API_KEY,
    "apiType":"chat-completions","models":models}]
with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(result, f, indent="\t", ensure_ascii=False)
    f.write("\n")
print(f"Done! Total: {len(models)} models")
