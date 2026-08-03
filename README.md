# VSCode Modelator

**Custom AI Provider Generator** — Fetch models from any OpenAI-compatible `/v1/models` endpoint and convert them to `chatLanguageModels.json` for VS Code Copilot Chat.

## What This Is

Browser-based tool that produces `chatLanguageModels.json` — the configuration file VS Code uses to register custom model providers in Copilot Chat.

No server required for basic use. Three ways to run:

- **Direct open** — double-click `index.html` (file://)
- **Local server** — `python -m http.server 8080`
- **App + proxy mode** — `python scripts/localhost_relay.py --app --api-url http://localhost:20128` (no CORS)

Designed for OpenAI/Anthropic-compatible proxies such as:
- [9Router](https://github.com/decolua/9router)
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute)
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
- [SwitchIt](https://github.com/xirf/switchit)
- Any OpenAI/Anthropic-compatible endpoint

## Features

- Multi-endpoint batch fetch & merge
- Individual endpoint fetch
- Endpoint config saved to localStorage
- API Type selector (Chat / Responses / Messages)
- Three source modes: URL, Paste, Upload
- Fetch URL override (bypass localhost CORS)
- Secret auto-generation
- App mode (`--app`) — same-origin proxy
- WebSocket relay
- HTTP CORS proxy
- One-click copy/paste fields
- Collapsible endpoint rows
- Downloadable fetch scripts (py/bat/sh)
- Tree & Code editor views (Ace.js)
- Tree view: multi-select models, batch delete, batch edit, inline value editing
- Code ↔ Tree sync (edits in code editor reflected in tree)
- Find & Replace with regex
- JSON formatting
- Schema-aware autocomplete
- Activity log panel
- Collapsible panels
- Dark/Light theme
- i18n: English & Indonesian

## Quick Start

1. **Add an endpoint.** Enter the API base URL and authentication key.
2. **Fetch.** Click **Fetch All & Merge**. Models fetched and merged into one list.
3. **Inspect.** Switch to **Editor** panel. Toggle Tree / Code view.
4. **Save.** Click **Download**. Place file in VS Code user directory, restart VS Code.

## Localhost Access

Browsers block `fetch()` from HTTPS to HTTP localhost (mixed content). Several solutions:

### 1. App Mode (recommended)
Serves web app + API proxy on same origin — zero CORS, zero mixed-content.
```bash
python scripts/localhost_relay.py --app --api-url http://localhost:20128
# Open http://127.0.0.1:9877/
```

### 2. WebSocket Relay
```bash
pip install websockets
python scripts/localhost_relay.py
```

### 3. HTTP CORS Proxy
```bash
python scripts/localhost_relay.py --http
```

### 4. Fetch URL Override
Each endpoint has a **Fetch URL** field. Browser fetches from this URL; config uses Endpoint URL.

### 5. Paste / Upload
Select **Paste JSON** or **Upload** source. Fetch JSON manually via curl/scripts.

## Endpoint Credentials

- **Endpoint API Key** — real credential for `/v1/models` fetch. Never written to output.
- **Secret API Key** — VS Code secret ref `${input:chat.lm.secret....}` stored in output. Auto-generated if empty.

## Source Types

| Source | Description |
|---|---|
| **URL** | Fetch from `/v1/models` endpoint |
| **Paste JSON** | Paste raw JSON response |
| **Upload** | Upload `models_raw.json` |

## Response Formats

Normalized automatically:
- **OpenAI** `{"object":"list","data":[...]}`
- **Capabilities** `{"id":"model","capabilities":{...}}`
- **Flat array** `[{"id":"model1"},...]`
- **Vercel AI SDK** `{"models":[...]}`

## Output Format

```json
[{
  "name": "9Router",
  "vendor": "customendpoint",
  "apiKey": "${input:chat.lm.secret.-65d90303}",
  "apiType": "chat-completions",
  "models": [{
    "id": "gpt-4o",
    "url": "http://localhost:20128/v1",
    "toolCalling": true,
    "vision": true,
    "maxInputTokens": 128000,
    "maxOutputTokens": 64000
  }]
}]
```

### API Types

| apiType | Endpoint |
|---|---|
| `chat-completions` | `/v1/chat/completions` |
| `responses` | `/v1/responses` |
| `messages` | `/v1/messages` |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+E` | Toggle edit mode |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find & Replace |
| `Shift+Alt+F` | Format JSON |
| `Enter` (fetch focused) | Fetch All |

## File Placement

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Code\User\` |
| macOS | `~/Library/Application Support/Code/User/` |
| Linux | `~/.config/Code/User/` |

Restart VS Code after placing file.

## How It Works

Each endpoint gets a GET to `/v1/models`. Response parsed, models normalized, results merged. All browser-side — no data transmitted except your API requests.

## Under the Hood

| Layer | |
|---|---|
| Editor | Ace.js 1.32.7 |
| Fonts | Inter + JetBrains Mono |
| Icons | Material Symbols Outlined |
| Architecture | Vanilla HTML/CSS/JS |
| Theme | CSS custom properties |
| Storage | localStorage |
| i18n | `lang/` JSON files |
| Proxy | `localhost_relay.py` |

## Installation

No install required:
```bash
# Direct — double-click index.html
# Local server
python -m http.server 8080
# App mode (bypasses CORS)
python scripts/localhost_relay.py --app --api-url http://localhost:20128
```

### Requirements
- Modern browser
- Python 3.x (for scripts)
- `pip install websockets` (optional, for WebSocket relay)

## Project Structure

```
vscode-modelator/
├── index.html
├── README.md
├── assets/
│   ├── style.css
│   └── app.js
├── lang/
│   ├── i18n.js
│   ├── en_US.json
│   └── id_ID.json
├── scripts/
│   ├── localhost_relay.py
│   ├── fetch_models.*
│   ├── convert_models.*
│   └── fetch_and_convert.*
├── sources/          (gitignored)
└── .github/workflows/
    └── static.yml
```

## License

MIT

---

Made with **Big Pickle** by [Helmi Amirudin](https://helmiau.com) © 2026
