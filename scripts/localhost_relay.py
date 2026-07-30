#!/usr/bin/env python3
"""
9Router Localhost Relay Server
Bridges GitHub Pages (HTTPS) to localhost (HTTP) via WebSocket.
The web app connects to this relay via WebSocket, and the relay fetches from localhost.

Usage:
    python scripts/localhost_relay.py [--port 9876] [--host 127.0.0.1]

The relay:
1. Starts a WebSocket server on the given port
2. Web app connects via ws://127.0.0.1:9876
3. Web app sends: {"action":"fetch","url":"http://localhost:20128/v1/models","token":"sk-xxx"}
4. Relay fetches from localhost and returns the result via WebSocket
"""
import asyncio
import json
import sys
import argparse
import urllib.request
import urllib.error
import ssl
from pathlib import Path

try:
    import websockets
except ImportError:
    print("ERROR: websockets package not installed.")
    print("Install with: pip install websockets")
    sys.exit(1)

# --- Configuration ---
DEFAULT_PORT = 9876
DEFAULT_HOST = "127.0.0.1"
OUTPUT_PORT = DEFAULT_PORT
API_FILE = "api.txt"

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
            return {"error": f"Expected object=list, got {data.get('object')}"}
        
        return {"success": True, "data": data, "count": len(data.get("data", []))}
    
    except urllib.error.URLError as e:
        return {"error": f"Cannot connect to {url}: {e}"}
    except Exception as e:
        return {"error": f"Error: {e}"}

async def handle_client(websocket):
    """Handle a WebSocket client connection"""
    client_addr = websocket.remote_address
    print(f"[+] Client connected: {client_addr}")
    
    try:
        async for message in websocket:
            try:
                request = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"error": "Invalid JSON"}))
                continue
            
            action = request.get("action", "")
            
            if action == "ping":
                await websocket.send(json.dumps({"pong": True}))
            
            elif action == "fetch":
                url = request.get("url", "")
                token = request.get("token", "")
                
                if not url:
                    await websocket.send(json.dumps({"error": "URL required"}))
                    continue
                
                print(f"  Fetching: {url}")
                result = fetch_models(url, token)
                
                if "error" in result:
                    print(f"  Error: {result['error']}")
                else:
                    print(f"  Success: {result['count']} models")
                
                await websocket.send(json.dumps(result))
            
            elif action == "status":
                await websocket.send(json.dumps({
                    "status": "ok",
                    "version": "1.0.0",
                    "clients": 1
                }))
            
            else:
                await websocket.send(json.dumps({"error": f"Unknown action: {action}"}))
    
    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {client_addr}")
    except Exception as e:
        print(f"Error handling client {client_addr}: {e}")

async def main():
    parser = argparse.ArgumentParser(description="9Router Localhost Relay")
    parser.add_argument("--port", type=int, default=OUTPUT_PORT, help=f"WebSocket port (default: {OUTPUT_PORT})")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST, help=f"Bind address (default: {DEFAULT_HOST})")
    args = parser.parse_args()
    
    print(f"""
╔══════════════════════════════════════════════╗
║     9Router Localhost Relay v1.0.0          ║
║     WebSocket bridge for GitHub Pages       ║
╠══════════════════════════════════════════════╣
║  Listening on: ws://{args.host}:{args.port}       ║
║  Press Ctrl+C to stop                       ║
╚══════════════════════════════════════════════╝
""")
    
    async with websockets.serve(handle_client, args.host, args.port):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nRelay stopped.")
    except OSError as e:
        if "address already in use" in str(e).lower() or "10048" in str(e):
            print(f"ERROR: Port {OUTPUT_PORT} is already in use.")
            print(f"Try: python localhost_relay.py --port {OUTPUT_PORT + 1}")
        else:
            print(f"ERROR: {e}")
        sys.exit(1)