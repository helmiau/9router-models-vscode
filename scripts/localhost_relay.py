#!/usr/bin/env python3
"""
9Router Localhost Relay Server
Bridges GitHub Pages (HTTPS) to localhost (HTTP).

Modes:
- WebSocket relay (default, ws://127.0.0.1:9876)
  Web app connects via WebSocket, relay fetches from localhost.

- HTTP CORS proxy (--http, http://127.0.0.1:9877)
  Adds CORS headers so the web app can fetch directly when on HTTP.

Usage:
    python scripts/localhost_relay.py                  # WebSocket only
    python scripts/localhost_relay.py --http            # WebSocket + HTTP proxy
    python scripts/localhost_relay.py --http-only       # HTTP proxy only
"""
import asyncio
import json
import os
import shutil
import sys
import argparse
import urllib.request
import urllib.error
import ssl
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import websockets
except ImportError:
    print("WARN: websockets package not installed (WebSocket mode unavailable).")
    print("Install with: pip install websockets")
    websockets = None

# --- Configuration ---
DEFAULT_PORT = 9876
DEFAULT_HOST = "127.0.0.1"
OUTPUT_PORT = DEFAULT_PORT
API_FILE = "api.txt"
MODEL_FILE = "chatLanguageModels.json"


def default_vscode_user_dir():
    """Default VS Code user dir per OS (customisable via VSCODE_USER_DIR)."""
    env = os.environ.get("VSCODE_USER_DIR")
    if env:
        return Path(env)
    home = Path.home()
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
        return base / "Code" / "User"
    if sys.platform == "darwin":
        return home / "Library" / "Application Support" / "Code" / "User"
    return home / ".config" / "Code" / "User"

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

# --- HTTP Server (CORS Proxy + App Server) ---

HTTP_PROXY_PORT = 9877
APP_PORT = 9877  # same port for --app mode
BASE_DIR = Path(__file__).resolve().parent.parent  # project root (D:\GithubRepository\9router-vscode)
API_FILE_PATH = BASE_DIR / "api.txt"

# MIME types for static file serving
MIME_MAP = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
}


class AppServerHandler(BaseHTTPRequestHandler):
    """HTTP server that serves the web app AND proxies API calls — same origin, no CORS needed."""

    # Store config at class level (set before server starts)
    api_url = None  # e.g. http://localhost:20128
    api_key = None

    def do_OPTIONS(self):
        self._send_cors()
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        # --- API proxy endpoint ---
        if path == "/proxy":
            params = parse_qs(parsed.query)
            target = params.get("url", [None])[0]
            token = self.headers.get("Authorization", "").replace("Bearer ", "")
            if not target:
                self._send_json(400, {"error": "Usage: /proxy?url=TARGET_URL"})
                return
            result = fetch_models(target, token)
            self._send_json(200, result)
            return

        # --- Models fetch proxy (direct passthrough to configurable API) ---
        if path == "/v1/models" and self.api_url:
            token = self.api_key or self.headers.get("Authorization", "").replace("Bearer ", "")
            target = self.api_url.rstrip("/") + "/v1/models"
            print(f"  [APP] Proxying /v1/models → {target}")
            result = fetch_models(target, token)
            self._send_json(200, result)
            return

        # --- Config endpoint (lets the frontend know if app mode is active) ---
        if path == "/api/config":
            self._send_json(200, {
                "app_mode": True,
                "api_url": self.api_url or "",
                "has_api_key": bool(self.api_key),
            })
            return

        # --- Serve static files ---
        self._serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/key":
            # Save API key from frontend
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(body)
                key = data.get("key", "")
                if key:
                    self.__class__.api_key = key
                    API_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
                    API_FILE_PATH.write_text(key)
                    print(f"  [APP] API key saved ({len(key)} chars)")
                self._send_json(200, {"ok": True})
            except Exception as e:
                self._send_json(400, {"error": str(e)})
            return

        if parsed.path == "/api/install":
            # Install chatLanguageModels.json: web sends generated JSON (raw),
            # server writes it to default VS Code user dir or a custom target.
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b"{}"
            try:
                data = json.loads(body)
            except json.JSONDecodeError:
                self._send_json(400, {"error": "Invalid JSON body"})
                return

            raw = data.get("raw")
            target = (data.get("target") or "").strip()
            api_url = (data.get("api_url") or self.api_url or "").strip()
            key = data.get("key") or self.api_key or ""

            # Optional server-side fetch (raw not sent by web)
            if not raw:
                if not api_url:
                    self._send_json(400, {"error": "raw or api_url required"})
                    return
                result = fetch_models(api_url.rstrip("/") + "/v1/models", key)
                if "error" in result:
                    self._send_json(400, {"error": result["error"]})
                    return
                raw = result["data"]

            if not isinstance(raw, list):
                self._send_json(400, {"error": "raw must be an array of providers"})
                return

            target_dir = Path(target).expanduser() if target else default_vscode_user_dir()
            target_file = target_dir / MODEL_FILE
            backup = None
            if target_file.exists():
                backup = str(target_file.with_suffix(".json.bak"))
                shutil.copy2(target_file, backup)
            target_dir.mkdir(parents=True, exist_ok=True)
            target_file.write_text(json.dumps(raw, indent=4), encoding="utf-8")
            count = sum(len(p.get("models", [])) for p in raw)
            print(f"  [APP] Installed {MODEL_FILE} -> {target_file} ({count} models)")
            self._send_json(200, {
                "ok": True,
                "target": str(target_file),
                "backup": backup,
                "models": count,
            })
            return

        self._send_json(405, {"error": "Method not allowed"})

    def _serve_static(self, path):
        """Serve a static file from the project root."""
        # Default to index.html
        if path == "/" or path == "":
            path = "/index.html"

        file_path = BASE_DIR / path.lstrip("/")
        # Security: prevent directory traversal
        file_path = file_path.resolve()
        if not str(file_path).startswith(str(BASE_DIR)):
            self._send_error(403, "Forbidden")
            return

        if not file_path.exists() or not file_path.is_file():
            self._send_error(404, "Not Found")
            return

        ext = file_path.suffix.lower()
        ctype = MIME_MAP.get(ext, "application/octet-stream")
        try:
            data = file_path.read_bytes()
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self._send_error(500, str(e))

    def _send_json(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_error(self, status, msg):
        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(msg.encode())

    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")

    def log_message(self, fmt, *args):
        method, path, code = args[0], args[1], args[2]
        if path != "/favicon.ico":
            print(f"  [HTTP] {method} {path} → {code}")

    def log_error(self, fmt, *args):
        pass


def _run_http_server(host, port, handler_class, label):
    """Run an HTTP server in a thread."""
    server = HTTPServer((host, port), handler_class)
    print(f"  {label} → http://{host}:{port}")
    if "/proxy" not in label:
        print(f"           Open browser at http://{host}:{port}")
    server.serve_forever()


async def run_http_server_async(host, port, handler_class, label):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run_http_server, host, port, handler_class, label)


async def main():
    # Unicode banner must survive non-UTF-8 stdio (PowerShell jobs, cp1252 shells)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="9Router Localhost Relay")
    parser.add_argument("--host", type=str, default=DEFAULT_HOST, help=f"Bind address (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=OUTPUT_PORT, help=f"WebSocket port (default: {OUTPUT_PORT})")
    parser.add_argument("--http", action="store_true", help="Also start HTTP CORS proxy")
    parser.add_argument("--http-only", action="store_true", help="Start HTTP CORS proxy only (no WebSocket)")
    parser.add_argument("--http-port", type=int, default=HTTP_PROXY_PORT, help=f"HTTP proxy port (default: {HTTP_PROXY_PORT})")
    parser.add_argument("--app", action="store_true", help="Serve web app + proxy API (recommended — no CORS)")
    parser.add_argument("--api-url", type=str, default="", help="API base URL (e.g. http://localhost:20128)")
    parser.add_argument("--api-key", type=str, default="", help="API key (or use api.txt)")
    args = parser.parse_args()

    # --- --app mode: serve web app + proxy API, same origin ---
    if args.app:
        AppServerHandler.api_url = args.api_url
        AppServerHandler.api_key = args.api_key
        api_txt = BASE_DIR / "api.txt"
        if not AppServerHandler.api_key and api_txt.exists():
            AppServerHandler.api_key = api_txt.read_text().strip()
        print(f"""
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
\u2551      9Router Localhost App Server v1.2.0      \u2551
\u2551     Web app + API proxy \u2014 same origin         \u2551
\u2551     No CORS, no mixed-content issues          \u2551
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550""")
        if AppServerHandler.api_url:
            print(f"  API: {AppServerHandler.api_url}")
        print(f"  App: http://{args.host}:{args.http_port}/")
        print(f"  Press Ctrl+C to stop\n")
        AppServerHandler.api_url = AppServerHandler.api_url or ""
        await run_http_server_async(args.host, args.http_port, AppServerHandler, "App + API proxy")
        return

    # --- Legacy modes (WebSocket / CORS proxy) ---
    banner = []
    banner.append("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550")
    banner.append("\u2551      9Router Localhost Relay v1.1.0          \u2551")
    banner.append("\u2551     Bridge localhost APIs to your browser    \u2551")
    banner.append("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550")

    if not args.http_only:
        if websockets is None:
            print("ERROR: websockets package required for WebSocket mode.")
            print("Install: pip install websockets")
            sys.exit(1)
        banner.append(f"\u2551  WebSocket relay \u2192 ws://{args.host}:{args.port}      \u2551")

    if args.http or args.http_only:
        banner.append(f"\u2551  HTTP CORS proxy \u2192 http://{args.host}:{args.http_port}    \u2551")

    banner.append("\u2551  Press Ctrl+C to stop                       \u2551")
    banner.append("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d")
    print("\n".join(banner))
    print()

    async def _run_ws():
        async with websockets.serve(handle_client, args.host, args.port):
            await asyncio.Future()

    async def _run_all():
        coros = []
        if not args.http_only:
            coros.append(_run_ws())
        if args.http or args.http_only:
            coros.append(run_http_server_async(args.host, args.http_port, AppServerHandler, "HTTP CORS proxy"))
        await asyncio.gather(*coros)

    await _run_all()

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