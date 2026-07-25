#!/usr/bin/env python3
"""Fetch models from 9Router and save as models_raw.json"""
import sys, json, os, urllib.request, urllib.error

API_URL = "http://localhost:20128/v1/models"
OUTPUT = "models_raw.json"
API_FILE = "api.txt"

# Token: DEFAULT_API_KEY (web form) > CLI arg > api.txt > prompt
DEFAULT_API_KEY = ""
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

req = urllib.request.Request(API_URL, headers={
    "Authorization": f"Bearer {token}",
    "Accept": "application/json"
})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    if data.get("object") != "list":
        sys.exit(f"ERROR: Expected object=list, got {data.get('object')}")
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent="\t", ensure_ascii=False)
    print(f"Saved {len(data.get('data', []))} models to {OUTPUT}")
except urllib.error.URLError as e:
    sys.exit(f"ERROR: Cannot connect to {API_URL}\n{e}\nMake sure 9Router is running.")
except Exception as e:
    sys.exit(f"ERROR: {e}")
