#!/usr/bin/env python3
"""
9Router Bridge - localhost relay + auto-install chatLanguageModels.json

Modes (default: install then relay):
    python scripts/bridge.py                        # install + start app relay
    python scripts/bridge.py --install-only         # just install the JSON
    python scripts/bridge.py --relay-only           # just start the relay

Install customisation:
    --source PATH     path to chatLanguageModels.json (default: auto-detect)
    --target PATH     install dir override (default: VS Code user dir per-OS,
                      or $VSCODE_USER_DIR if set)

Relay:
    --api-url URL     API base URL (e.g. http://localhost:20128)
    --api-key KEY     API key (or use api.txt)
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

MODEL_FILE = "chatLanguageModels.json"
RELAY = Path(__file__).resolve().parent / "localhost_relay.py"
PROJECT_ROOT = Path(__file__).resolve().parent.parent


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


def find_source(source):
    if source:
        p = Path(source).expanduser()
        if not p.exists():
            sys.exit(f"ERROR: source not found: {p}")
        return p
    for cand in (Path.cwd(), PROJECT_ROOT, PROJECT_ROOT / "downloads"):
        p = cand / MODEL_FILE
        if p.exists():
            return p
    sys.exit(f"ERROR: {MODEL_FILE} not found. Pass --source <path>.")


def install(args):
    src = find_source(args.source)
    target_dir = Path(args.target).expanduser() if args.target else default_vscode_user_dir()
    target = target_dir / MODEL_FILE

    print(f"[install] source : {src}")
    print(f"[install] target : {target}")

    if target.exists():
        bak = target.with_suffix(".json.bak")
        shutil.copy2(target, bak)
        print(f"[install] backup : {bak}")

    target_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, target)
    print(f"[install] OK -> {target}")
    print(f"[install] Restart VS Code, then run: Chat: Manage Language Models")
    return target


def relay(args):
    cmd = [sys.executable, str(RELAY), "--app"]
    if args.api_url:
        cmd += ["--api-url", args.api_url]
    if args.api_key:
        cmd += ["--api-key", args.api_key]
    print(f"[relay]  starting: {' '.join(cmd)}")
    print("[relay]  open http://127.0.0.1:9877/  (Ctrl+C to stop)")
    subprocess.run(cmd)


def main():
    p = argparse.ArgumentParser(description="9Router Bridge: localhost relay + auto-install chatLanguageModels.json")
    p.add_argument("--install-only", action="store_true", help="install the JSON, do not start relay")
    p.add_argument("--relay-only", action="store_true", help="start relay, do not install")
    p.add_argument("--source", type=str, help="path to chatLanguageModels.json")
    p.add_argument("--target", type=str, help="install dir override (default: VS Code user dir)")
    p.add_argument("--api-url", type=str, help="API base URL for relay (e.g. http://localhost:20128)")
    p.add_argument("--api-key", type=str, help="API key for relay (or use api.txt)")
    args = p.parse_args()

    if not args.relay_only:
        install(args)
    if not args.install_only:
        relay(args)


if __name__ == "__main__":
    main()
