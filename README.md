# VSCode Modelator

**Custom AI Provider Generator** — fetch models from any OpenAI-compatible `/v1/models` endpoint and convert them to `chatLanguageModels.json` for VS Code Copilot Chat.

## What This Is

VSCode Modelator is a browser-based tool that produces `chatLanguageModels.json` — the configuration file VS Code uses to register custom model providers in Copilot Chat.

Single-file browser app. No server, no install, no analytics. The JSON output is the product.

Designed for use with OpenAI/Anthropic-compatible proxies such as:

- [9Router](https://github.com/decolua/9router) — local/remote AI gateway
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — multi-provider router
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — CLI-based proxy
- [SwitchIt](https://github.com/xirf/switchit) — provider switcher
- and any other OpenAI/Anthropic-compatible endpoint

## How To Use It

1. **Add an endpoint.** Paste the API base URL and authentication key. The URL resolves to a `/v1/models` endpoint at its root.
2. **Fetch.** Click **Fetch All & Merge**. Each endpoint is queried, responses normalized, and results merged into one list.
3. **Inspect.** Switch to **Editor**. Toggle between Tree and Code view. Edit mode enables direct modification of the JSON.
4. **Save.** Click **Download**. Place the file in your VS Code user directory (see paths below), restart VS Code.

## Endpoint API Key & Secret API Key

Each endpoint has two separate credential fields:

- **Endpoint API Key** — your real credential (e.g. `sk-xxxx`) used *only* to authenticate against the `/v1/models` endpoint during fetch. Never written to the output file.
- **Secret API Key (`chatLanguageModels.json`)** — a VS Code secret input reference like `${input:chat.lm.secret.-65d90303}`. This is what gets stored in `chatLanguageModels.json`. If left empty, one is auto-generated. When you select the model in Copilot Chat, VS Code prompts you for the actual key through its secure dialog.

This separation means the generated JSON file can be shared, backed up, or inspected without leaking credentials.

## When Direct Fetch Fails

Firewalls, localhost-only networks, and CORS policies can block browser requests. Use the offline path:

1. Open **Scripts**
2. Pick your OS and a mode (curl, Python, or PowerShell)
3. Run the downloaded script on a machine with API access
4. Copy the output JSON into the **Paste JSON** tab in the Editor panel

## Response Formats

The converter normalizes these shapes automatically:

- **OpenAI standard** — `{"object":"list","data":[...]}`
- **Capabilities envelope** — `{"id":"model","capabilities":{...}}`
- **Flat array** — `[{"id":"model1"},...]`
- **Vercel AI SDK** — `{"models":[...]}`

Unrecognized formats still render in the editor — inspect and fix manually.

## chatLanguageModels.json Format

The output is an array of provider objects — one per endpoint:

```json
[
  {
    "name": "9Router",
    "vendor": "customendpoint",
    "apiKey": "sk-xxxxx or ${input:chat.lm.secret.-65d90303}",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "gpt-4o",
        "name": "gpt-4o",
        "url": "http://localhost:20128/v1",
        "toolCalling": true,
        "vision": true,
        "maxInputTokens": 128000,
        "maxOutputTokens": 64000
      }
    ]
  }
]
```

### API Type Options

| apiType | Label | Endpoint | Description |
|---|---|---|---|
| `chat-completions` | Chat Completions | `/v1/chat/completions` | Standard OpenAI chat format |
| `responses` | Responses | `/v1/responses` | OpenAI responses API format |
| `messages` | Messages | `/v1/messages` | Anthropic messages API format |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl + E` | Toggle edit mode |
| `Ctrl + F` | Find |
| `Ctrl + H` | Find & Replace |
| `Shift + Alt + F` | Format / pretty-print JSON |
| `Escape` | Close find bar / autocomplete |
| `Tab` | Accept autocomplete suggestion |

## File Placement

| OS | Path |
|---|---|
| Windows | `%APPDATA%\Code\User\` |
| macOS | `~/Library/Application Support/Code/User/` |
| Linux | `~/.config/Code/User/` |

Restart VS Code after placing the file.

## Supported Providers

| Provider | Source |
|---|---|
| **9Router** | [decolua/9router](https://github.com/decolua/9router) |
| **OmniRoute** | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) |
| **CLIProxyAPI** | [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) |
| **OpenAI** | [OpenAI Platform](https://platform.openai.com/docs/api-reference/models/list) |

Any provider that implements the [OpenAI Models API](https://platform.openai.com/docs/api-reference/models/list) (`GET /v1/models`) works with VSCode Modelator.

## Features

- **Multi-endpoint batch** — add unlimited endpoints, fetch & merge in one click
- **Individual fetch** — fetch a single endpoint without affecting others
- **Endpoint persistence** — configurations auto-saved to localStorage
- **API Type selector** — smart combobox for `chat-completions`, `responses`, or `messages`
- **Web UI** — fetch from URL, paste JSON, or upload `models_raw.json`
- **Dynamic curl command** — auto-updates with your endpoint & key, one-click copy
- **Copy & Paste buttons** — one-click copy/paste for endpoint name, URL, and API key
- **Downloadable scripts** — `.py`, `.bat`, `.sh` with your values pre-filled
- **Light/Dark theme** — toggle persists via localStorage
- **Cache** — auto-saves last result, restore on reload
- **Drag & drop upload** — drop `models_raw.json` directly
- **Tree view** — collapsible provider → models → model hierarchy
- **Code view** — syntax-highlighted JSON editor with Ace.js
- **Edit mode overlay** — edit JSON with live syntax highlighting
- **Find & Replace** — full search bar with regex, case-sensitive, keyboard navigation
- **Format / Beautify** — one-click JSON formatting
- **Schema-aware autocomplete** — JSON schema keys with dropdown and keyboard navigation
- **Activity log** — timestamped log of all actions
- **Collapsible panels** — editor and log panels can be minimized/maximized

## How It Works

Each configured endpoint receives a GET request to its `/v1/models` path. The response is parsed, model entries normalized into a consistent schema, and results from all endpoints merged into a single file. All processing happens in the browser — no data is transmitted except the API requests you explicitly configure.

## Under The Hood

| Layer | Implementation |
|---|---|
| Editor | Ace.js 1.32.7 overlay |
| Fonts | Inter + JetBrains Mono (Google Fonts) |
| Icons | Material Symbols Outlined (Google) |
| Architecture | Single HTML + CSS + JavaScript, zero dependencies |
| Theme | Dark/Light via CSS custom properties, persisted in localStorage |
| Storage | Endpoint configs + cache in localStorage |

## Installation

No installation required. Open `index.html` directly or serve locally:

```bash
# Option 1: direct open — double-click index.html
# Option 2: local server
python -m http.server 8080
# Then open http://localhost:8080
```

### Requirements

- **Web UI**: Modern browser (Chrome, Firefox, Edge)
- **Scripts**: Python 3.x (for `.py`), or Bash (for `.sh`), or Windows CMD (for `.bat`)

## Project Structure

```
vscode-modelator/
├── index.html              # Web UI entry point
├── assets/
│   ├── style.css           # Theme (light/dark)
│   └── app.js              # Application logic
├── scripts/
│   ├── fetch_models.*      # Fetch only (py/bat/sh)
│   ├── convert_models.*    # Convert only (py/bat/sh)
│   └── fetch_and_convert.* # Combined (py/bat/sh)
└── README.md
```

## License

MIT

---

<div class="markdown-footer"><p>This project is made with <strong>Big Pickle</strong> by <a href="https://opencode.ai" target="_blank" rel="noopener">OpenCode</a> &amp; <a href="https://code.visualstudio.com" target="_blank" rel="noopener">VS Code</a> — <a href="https://github.com/helmiau" target="_blank" rel="noopener">github.com/helmiau</a> · <a href="https://helmiau.com" target="_blank" rel="noopener">helmiau.com</a> © 2026</p></div>
