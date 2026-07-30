#!/usr/bin/env python3
"""
Localhost Proxy Script for 9Router VSCode Modelator
This script fetches models from localhost endpoints and saves them for the web app to read.
"""
import sys
import json
import os
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
OUTPUT_DIR = "sources"
OUTPUT_FILE = "localhost_models.json"
API_FILE = "api.txt"

# Ensure output directory exists
Path(OUTPUT_DIR).mkdir(exist_ok=True)

def fetch_models(url, token):
    """Fetch models from a given URL with authentication token"""
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    })
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
        
        if data.get("object") != "list":
            return None, f"Expected object=list, got {data.get('object')}"
        
        return data, None
    
    except urllib.error.URLError as e:
        return None, f"Cannot connect to {url}: {e}"
    except Exception as e:
        return None, f"Error: {e}"

def main():
    # Get URL and token from command line or prompt
    if len(sys.argv) < 2:
        print("Usage: python fetch_localhost_proxy.py <url> [token]")
        print("Example: python fetch_localhost_proxy.py http://localhost:20128/v1/models")
        return 1
    
    url = sys.argv[1]
    
    # Get token from command line, api.txt, or prompt
    if len(sys.argv) >= 3:
        token = sys.argv[2]
    elif os.path.exists(API_FILE):
        token = open(API_FILE).read().strip()
        print(f"Token from {API_FILE}")
    else:
        token = input("Enter API Key: ").strip()
        if not token:
            print("ERROR: API key required")
            return 1
    
    print(f"Fetching models from {url}...")
    
    # Fetch models
    models_data, error = fetch_models(url, token)
    
    if error:
        print(f"ERROR: {error}")
        return 1
    
    if not models_data:
        print("ERROR: No models data received")
        return 1
    
    # Save to file
    output_path = os.path.join(OUTPUT_DIR, OUTPUT_FILE)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(models_data, f, indent="\t", ensure_ascii=False)
    
    print(f"✅ Success! Saved {len(models_data.get('data', []))} models to {output_path}")
    print(f"\nThe web app can now read this file. Return to the browser and click 'Read Localhost File'.")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())