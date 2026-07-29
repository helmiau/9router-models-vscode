# VSCode Modelator

**VS Code Custom AI Provider Generator** — Ambil model dari endpoint `/v1/models` yang kompatibel dengan OpenAI dan konversikan ke `chatLanguageModels.json` untuk VS Code Copilot Chat.

## Apa Ini

VSCode Modelator adalah alat berbasis browser yang menghasilkan `chatLanguageModels.json` — file konfigurasi yang digunakan VS Code untuk mendaftarkan penyedia model kustom di Copilot Chat.

Aplikasi browser satu file. Tanpa server, tanpa instalasi, tanpa analitik. Output JSON adalah produknya.

Dirancang untuk digunakan dengan proxy yang kompatibel dengan OpenAI/Anthropic seperti:
- [9Router](https://github.com/decolua/9router) — gateway AI lokal/jarak jauh
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — router multi-penyedia
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — proxy berbasis CLI
- [SwitchIt](https://github.com/xirf/switchit) — pengalih penyedia
- Endpoint lain yang kompatibel dengan OpenAI/Anthropic

## Cara Penggunaan

1. **Tambahkan endpoint.** Tempel URL basis API dan kunci autentikasi. URL harus mengarah ke endpoint `/v1/models` (atau gunakan root endpoint).
2. **Ambil data.** Klik **Fetch All & Merge**. Setiap endpoint akan diminta, respons dinormalisasi, hasil digabung menjadi satu daftar.
3. **Periksa.** Beralih ke panel **Editor**. Alihkan antara tampilan Tree dan Code. Mode edit memungkinkan modifikasi langsung JSON.
4. **Simpan.** Klik **Download**. Tempatkan file di direktori pengguna VS Code (lihat jalur di bawah), lalu mulai ulang VS Code.

## Kunci API Endpoint & Kunci API Rahasia

Setiap endpoint memiliki dua bidang kredensial:

- **Endpoint API Key** — kredensial asli (mis. `sk-xxxx`) yang digunakan *hanya* untuk mengautentikasi pengambilan `/v1/models`. Tidak pernah ditulis ke file output.
- **Secret API Key** (entri `chatLanguageModels.json`) — referensi input rahasia VS Code seperti `${input:chat.lm.secret.-65d90303}`. Ini disimpan di `chatLanguageModels.json`. Jika dikosongkan, akan dibuat otomatis.

## Format Respons

Konverter menormalkan bentuk-bentuk ini secara otomatis:

- **OpenAI standar** `{"object":"list","data":[...]}`
- **Capabilities envelope** `{"id":"model","capabilities":{...}}`
- **Array datar** — `[{"id":"model1"},...]`
- **Vercel AI SDK** `{"models":[...]}`

Format yang tidak dikenal tetap ditampilkan di editor — periksa dan perbaiki secara manual.

## Opsi Tipe API

| apiType | Label | Endpoint | Deskripsi |
|---|---|---|---|
| `chat-completions` | Chat Completions | `/v1/chat/completions` | Format chat OpenAI standar |
| `responses` | Responses | `/v1/responses` | Format API Responses OpenAI |
| `messages` | Messages | `/v1/messages` | Format API Messages Anthropic |

## Pintasan Keyboard

| Tombol | Aksi |
|---|---|
| `Ctrl + E` | Alihkan mode edit |
| `Ctrl + F` | Cari |
| `Ctrl + H` | Cari & Ganti |
| `Shift + Alt + F` | Format / pretty-print JSON |
| `Escape` | Tutup bilah pencarian / autocomplete |
| `Tab` | Terima saran autocomplete |

## Penempatan File

| OS | Jalur |
|---|---|
| Windows | `%APPDATA%\Code\User\` |
| macOS | `~/Library/Application Support/Code/User/` |
| Linux | `~/.config/Code/User/` |

Mulai ulang VS Code setelah menempatkan file.

## Penyedia yang Didukung

| Penyedia | Sumber |
|---|---|
| **9Router** | [decolua/9router](https://github.com/decolua/9router) |
| **OmniRoute** | [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) |
| **CLIProxyAPI** | [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) |
| **OpenAI** | [OpenAI Platform](https://platform.openai.com/docs/api-reference/models/list) |

Penyedia apa pun yang mengimplementasikan [OpenAI Models API](https://platform.openai.com/docs/api-reference/models/list) (`GET /v1/models`) dapat digunakan dengan VSCode Modelator.

## Fitur

- **Batch multi-endpoint** — tambahkan endpoint tak terbatas, ambil & gabung dalam satu klik
- **Ambil individual** — ambil satu endpoint tanpa memengaruhi yang lain
- **Penyimpanan endpoint** — konfigurasi otomatis tersimpan ke localStorage
- **Pemilih Tipe API** — kombobox cerdas untuk `chat-completions`, `responses`, atau `messages`
- **Antarmuka Web** — ambil dari URL, tempel JSON, atau unggah `models_raw.json`
- **Perintah curl dinamis** — diperbarui otomatis dengan endpoint & kunci Anda, salin satu klik
- **Tombol Salin & Tempel** — salin/tempel satu klik untuk nama, URL, dan kunci API endpoint
- **Skrip yang dapat diunduh** — `.py`, `.bat`, `.sh` dengan nilai Anda sudah terisi

---

*Dibuat oleh [Helmi Amirudin](https://helmiau.com) © 2026*
