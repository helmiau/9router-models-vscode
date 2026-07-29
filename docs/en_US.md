# VSCode Modelator

**VS Code Custom AI Provider Generator** — Fetch models from any OpenAI-compatible `/v1/models` endpoint and convert them to `chatLanguageModels.json` for VS Code Copilot Chat.

## What This Is

VSCode Modelator is a browser-based tool that produces `chatLanguageModels.json` — the configuration file VS Code uses to register custom model providers in Copilot Chat.

Single-file browser app. No server, no install, no analytics. The JSON output is the product.

Designed for use with OpenAI/Anthropic-compatible proxies such as:
- [9Router](https://github.com/decolua/9router) — local/remote AI gateway
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — multi-provider router
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — CLI-based proxy
- [SwitchIt](https://github.com/xirf/switchit) — provider switcher
- Any other OpenAI/Anthropic-compatible endpoint

## How to Use

1. **Add an endpoint.** Paste the API base URL and authentication key. The URL should resolve to a `/v1/models` endpoint (or use the endpoint root).
2. **Fetch.** Click **Fetch All & Merge**. Each endpoint is queried, responses normalized, results merged into one list.
3. **Inspect.** Switch to the **Editor** panel. Toggle between Tree and Code view. Edit mode enables direct modification of the JSON.
4. **Save.** Click **Download**. Place the file in your VS Code user directory (see paths below), then restart VS Code.

## Endpoint API Key & Secret API Key

Each endpoint has two credential fields:

- **Endpoint API Key** — the real credential (e.g. `sk-xxxx`) used *only* to authenticate the `/v1/models` fetch. Never written to the output file.
- **Secret API Key** (`chatLanguageModels.json` entry) — a VS Code secret input reference like `${input:chat.lm.secret.-65d90303}`. This gets stored in `chatLanguageModels.json`. If left empty, one is auto-generated.

## Response Formats

The converter normalizes these shapes automatically:

- **OpenAI standard** `{"object":"list","data":[...]}`
- **Capabilities envelope** `{"id":"model","capabilities":{...}}`
- **Flat array** — `[{"id":"model1"},...]`
- **Vercel AI SDK** `{"models":[...]}`

Unrecognized formats still render in the editor — inspect and fix manually.

## API Type Options

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

---

*Made by [Helmi Amirudin](https://helmiau.com) © 2026*
