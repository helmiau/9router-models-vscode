# VSCode Modelator

**Bridge your OpenAI compatible models to Visual Studio Code custom models.**

Fetch models from any OpenAI-compatible endpoint (`/v1/models`) and convert them to `chatLanguageModels.json` — the config format used by VS Code Copilot Chat for custom model providers.

## Supported Providers

> ⚠️ **Note:** This tool is currently being optimized for **9Router**. Other providers are supported but may require adjustments.

| Provider | Source |
|---|---|
| **9Router** | [decolua/9router](https://github.com/decolua/9router) |
| **OmniRoute** | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) |
| **CLIProxyAPI** | [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) |
| **OpenAI** | [OpenAI Platform](https://platform.openai.com/docs/api-reference/models/list) |

Any provider that implements the [OpenAI Models API](https://platform.openai.com/docs/api-reference/models/list) (`GET /v1/models`) works with VSCode Modelator.

## Quick Start

### Web UI (Recommended)

1. Open `index.html` in your browser
2. Enter **Endpoint Name**, **Endpoint URL**, and **API Key / Token**
3. Click **Add Endpoint** to add more providers (repeat step 2)
4. Click **Fetch All & Merge** — fetches all endpoints and merges into one output
5. Copy or download `chatLanguageModels.json`

Each endpoint row has individual controls:
- ⚡ **Fetch** — fetch models from this single endpoint
- ✕ **Remove** — delete the endpoint row

Endpoint configurations are auto-saved to localStorage and restored on reload.

### CLI Scripts

Download from the **Scripts** tab or use directly:

| Script | Language | Action |
|---|---|---|
| `fetch_models.py/bat/sh` | Python/Batch/Bash | Fetch → `models_raw.json` |
| `convert_models.py/bat/sh` | Python/Batch/Bash | Convert → `chatLanguageModels.json` |
| `fetch_and_convert.py/bat/sh` | Python/Batch/Bash | Fetch + Convert |

```bash
# Example: fetch and convert from OpenAI
python scripts/fetch_and_convert.py

# Example: with API key
python scripts/fetch_and_convert.py sk-your-api-key
```

## How It Works

```
┌──────────────┐
│  Endpoint 1  │──┐
└──────────────┘  │
┌──────────────┐  │  GET /v1/models     ┌─────────────────────┐
│  Endpoint 2  │──┼───────────────────►  │  VSCode Modelator   │
└──────────────┘  │                      │  (Web UI / Script)  │
┌──────────────┐  │                      │                     │
│  Endpoint N  │──┘                      │  Merges all into:   │
└──────────────┘                         │  single JSON array  │
                                         └─────────┬───────────┘
                                                   │
                                                   ▼
                                     ┌───────────────────────┐
                                     │  chatLanguageModels   │
                                     │  .json                │
                                     │  ┌─────────────────┐  │
                                     │  │ [ { provider1 }, │  │
                                     │  │   { provider2 }, │  │
                                     │  │   ... ]          │  │
                                     │  └─────────────────┘  │
                                     └───────────┬───────────┘
                                                   │
                                                   ▼
                                     ┌───────────────────────┐
                                     │  VS Code Copilot Chat │
                                     │  → Uses custom models │
                                     └───────────────────────┘
```

## Features

- **Multi-endpoint batch** — add unlimited endpoints, fetch & merge in one click
- **Individual fetch** — fetch a single endpoint without affecting others
- **Endpoint persistence** — configurations auto-saved to localStorage
- **Web UI** — fetch, paste JSON, or upload `models_raw.json`
- **Dynamic curl command** — auto-updates with your endpoint & key, one-click copy
- **Clipboard paste** — paste API key, endpoint URL from clipboard
- **Downloadable scripts** — `.py`, `.bat`, `.sh` with your values pre-filled
- **Light/Dark theme** — Astryx-inspired, toggle persists via localStorage
- **Cache** — auto-saves last result, restore on reload
- **Drag & drop upload** — drop `models_raw.json` directly
- **Syntax-highlighted editor** — JSON output with color-coded keys, values, and brackets
- **Activity log** — timestamped log of all actions (fetch, convert, errors)
- **Collapsible panels** — editor and log panels can be minimized/maximized

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
  },
  {
    "name": "Mukramun",
    "vendor": "customendpoint",
    "apiKey": "key-2",
    "apiType": "chat-completions",
    "models": [
      {
        "id": "all",
        "name": "All Providers",
        "url": "http://localhost:20128/v1",
        "toolCalling": true,
        "vision": true,
        "maxInputTokens": 24000,
        "maxOutputTokens": 24000
      }
    ]
  }
]
```

### VS Code Secret Input

Use `${input:chat.lm.secret.-65d90303}` as the `apiKey` value — VS Code will prompt you to enter the key securely at runtime.

## Installation

No installation required. Open `index.html` directly or serve locally:

```bash
# Option 1: direct open
# Double-click index.html

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
│   ├── style.css           # Astryx-inspired theme (light/dark)
│   └── app.js              # Application logic
├── scripts/
│   ├── fetch_models.*      # Fetch only (py/bat/sh)
│   ├── convert_models.*    # Convert only (py/bat/sh)
│   └── fetch_and_convert.* # Combined (py/bat/sh)
└── README.md
```

## License

MIT
