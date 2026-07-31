/* ============================================
   VSCode Modelator — i18n Loader
   Loads language JSON, provides t() globally.
   ============================================ */
(function () {
  'use strict';

  const LANG_STORAGE_KEY = '9router_lang';

  // --- Inline English defaults (guaranteed to work) ---
  const FALLBACK_DATA = {
    "about.error_hint": "Make sure the file is served from the same directory.",
    "about.error_no_file": "Could not load README.md",
    "about.loading": "Loading documentation...",
    "about.toc": "Table of Contents",
    "api.chat": "Chat Completions",
    "api.messages": "Messages",
    "api.no_match": "No match",
    "api.responses": "Responses",
    "editor.cached": "Cached",
    "editor.clear": "Clear",
    "editor.code": "Code",
    "editor.combo": "combo",
    "editor.edit": "Edit",
    "editor.empty": "Output will appear after conversion",
    "editor.find_replace": "Find & Replace",
    "editor.models": "models",
    "editor.provider": "provider",
    "editor.title": "chatLanguageModels.json",
    "editor.tools": "tools",
    "editor.tree": "Tree",
    "editor.view": "View",
    "editor.vision": "vision",
    "endpoint.api_type_label": "API Type",
    "endpoint.api_type_placeholder": "Select API type",
    "endpoint.copy": "Copy",
    "endpoint.expected_list": "Expected object=\"list\"",
    "endpoint.fetch": "Fetch",
    "endpoint.fetch_title": "Fetch this endpoint only",
    "endpoint.file_loaded": "File loaded: {name}",
    "endpoint.generate": "Generate",
    "endpoint.generate_title": "Generate from pasted/uploaded JSON",
    "endpoint.header": "Endpoint",
    "endpoint.header_num": "Endpoint #{num}",
    "endpoint.invalid_format_list": "Invalid format: expected object=\"list\".",
    "endpoint.invalid_json": "Invalid JSON",
    "endpoint.invalid_json_file": "Invalid JSON in file",
    "endpoint.key_label": "Endpoint API Key",
    "endpoint.key_placeholder": "sk-xxxxx",
    "endpoint.models_count": "{count} models",
    "endpoint.name_label": "Endpoint Name",
    "endpoint.name_placeholder": "Provider name",
    "endpoint.paste": "Paste",
    "endpoint.paste_hint": "Response must have <code>object: \"list\"</code> with a <code>data</code> array.",
    "endpoint.paste_label": "Paste raw JSON from /v1/models",
    "endpoint.remove": "Remove",
    "endpoint.secret_hint": "Obtainable from VSCode chatLanguageModels.json",
    "endpoint.secret_label": "Secret API Key",
    "endpoint.secret_placeholder": "${input:chat.lm.secret.-65d90303}",
    "endpoint.show_hide": "Show/Hide",
    "endpoint.source": "Source",
    "endpoint.source_paste": "Paste JSON",
    "endpoint.source_placeholder": "Select source",
    "endpoint.source_upload": "Upload",
    "endpoint.source_url": "URL",
    "endpoint.type_chat": "Chat Completions",
    "endpoint.type_messages": "Messages",
    "endpoint.type_responses": "Responses",
    "endpoint.upload_hint": "Upload a <code>models_raw.json</code> file fetched from a <code>/v1/models</code> endpoint.",
    "endpoint.upload_label": "Upload models_raw.json",
    "endpoint.upload_placeholder": "Click to select or drop .json here",
    "endpoint.url_hint": "• URL points to a <code>/v1/models</code> endpoint.<br>• API Key is sent as Bearer token in the <code>Authorization</code> header.",
    "endpoint.url_key_required": "Endpoint #{num}: URL and API Key are required.",
    "endpoint.url_key_required_log": "Endpoint #{num}: URL and API Key required",
    "endpoint.url_label": "Endpoint URL",
    "endpoint.url_placeholder": "http://localhost:20128/v1/models",
    "home.add_endpoint": "Add Endpoint",
    "home.cors_hint": "<strong>🔒 Mixed content blocked?</strong><br>Browser from <code>https://</code> page cannot fetch <code>http://localhost</code>.<br><br><strong>Options:</strong><br>• Open this page via <code>file://</code> — double-click <code>index.html</code><br>• Run a local server: <code>python -m http.server 8080</code><br>• Paste JSON using the section above<br>• Use the <code>.bat</code> / <code>.sh</code> / <code>.py</code> scripts",
    "home.fetch_all": "Fetch All & Merge",
    "home.hint_scripts": "Or download the fetch script from the <strong>Scripts</strong> tab.",
    "home.howto": "How to get JSON (models_raw):",
    "home.install_hint_file": "File generated! Now install it:",
    "home.install_note": "For macOS: <code>~/Library/Application Support/Code/User/</code> &nbsp;|&nbsp; Linux: <code>~/.config/Code/User/</code>",
    "home.install_step1": "Click <strong>Download</strong> in the Editor panel to save <code>chatLanguageModels.json</code>.",
    "home.install_step2": "Copy the file to your VS Code user directory:",
    "home.install_step3": "Restart VS Code.",
    "home.install_step4": "Press <span class=\"docs-kbd\">Ctrl+Shift+P</span> (or <span class=\"docs-kbd\">Cmd+Shift+P</span> on Mac) and type <strong>Chat: Manage Language Models</strong>, hit Enter.",
    "home.install_step5": "Locate your custom provider in the list. Click the <strong>gear icon</strong> next to it.",
    "home.install_step6": "Paste your API key into the input field and save.",
    "home.loaded_from_cache": "Loaded from cache",
    "home.output_file": "Output File Name",
    "home.subtitle": "Generate <code>chatLanguageModels.json</code> for VS Code from any OpenAI-compatible proxy.",
    "lang.code": "en_US",
    "lang.name": "English (US)",
    "log.added_endpoint": "Added endpoint #{id}",
    "log.all_curl_copied": "All curl commands copied",
    "log.all_failed": "All endpoints failed",
    "log.cache_cleared": "Cache cleared",
    "log.copied": "Copied!",
    "log.cache_loaded": "Loaded {count} models from cache",
    "log.clipboard_denied": "Clipboard access denied",
    "log.conversion_done": "Conversion complete: {count} models from {providers} endpoint(s)",
    "log.copied_from": "Copied from #{id}",
    "log.copy_failed": "Copy failed",
    "log.curl_all_copied": "All curl commands copied",
    "log.curl_copied": "curl command copied",
    "log.downloaded": "Downloaded {file}",
    "log.edit_disabled": "Edit mode disabled",
    "log.edit_enabled": "Edit mode enabled",
    "log.expected_list": "Endpoint #{id}: expected object=\"list\"",
    "log.fetch_error": "Endpoint #{id}: {msg}",
    "log.fetch_success": "Endpoint #{id} ({name}): {count} models",
    "log.fetching": "Fetching endpoint #{id}: {url}",
    "log.fetching_all": "Fetching {count} endpoint(s)...",
    "log.file_loaded": "File loaded: {name} ({count} models)",
    "log.format_failed": "Format failed: {msg}",
    "log.init": "VSCode Modelator initialized",
    "log.install_path_copied": "Install path copied to clipboard",
    "log.invalid_format_uploaded": "Invalid format in uploaded file",
    "log.invalid_json": "Endpoint #{id}: invalid JSON",
    "log.invalid_json_uploaded": "Invalid JSON in uploaded file",
    "log.invalid_paste": "Endpoint #{id}: invalid JSON",
    "log.invalid_upload": "Invalid JSON in uploaded file",
    "log.json_formatted": "JSON formatted",
    "log.key_required_err": "Endpoint #{id}: Endpoint API Key required",
    "log.no_activity": "No activity yet",
    "log.no_endpoints": "No endpoints configured",
    "log.no_file_uploaded": "Endpoint #{id}: no file uploaded",
    "log.no_json_pasted": "Endpoint #{id}: no JSON pasted",
    "log.no_json_provided": "Endpoint #{i}: no JSON provided",
    "log.nothing_copy": "Nothing to copy",
    "log.nothing_download": "Nothing to download",
    "log.paste_models": "Endpoint #{id} ({name}): {count} models",
    "log.paste_success": "Endpoint #{id} ({name}): {count} models",
    "log.pasted_into": "Pasted into #{id}",
    "log.path_copied": "Install path copied to clipboard",
    "log.removed_endpoint": "Removed endpoint #{id}",
    "log.script_downloading": "Downloading script: {file}",
    "log.script_failed": "Script download failed: {msg}",
    "log.source_changed": "Endpoint #{id}: source → {type}",
    "log.switched_panel": "Switched to {name} panel",
    "log.theme_changed": "Theme: {mode}",
    "log.upload_models": "Endpoint #{id} ({name}): {count} models",
    "log.upload_success": "Endpoint #{id} ({name}): {count} models",
    "log.uploading_file": "Uploading file: {name}",
    "log.url_required_err": "Endpoint #{id}: URL required",
    "scripts.auto_detected": "Auto-detected",
    "scripts.combined_desc": "Fetch + Convert in one step",
    "scripts.combined_label": "Combined",
    "scripts.convert_desc": "Converts models_raw.json → chatLanguageModels.json",
    "scripts.convert_label": "Convert Only",
    "scripts.download": "Download",
    "scripts.fetch_desc": "Fetches from /v1/models → models_raw.json",
    "scripts.fetch_label": "Fetch Only",
    "scripts.linux_label": "Linux",
    "scripts.macos_label": "macOS",
    "scripts.mode": "Script Mode",
    "scripts.os": "Operating System",
    "scripts.python_label": "Python",
    "scripts.select_all": "Select all",
    "scripts.selected": "selected",
    "scripts.windows_label": "Windows",
    "scripts.workflow_hint": "<strong>💡 Workflow when localhost is not accessible:</strong><br>1. Download a <strong>Fetch</strong> script → run on machine with access → produces <code>models_raw.json</code><br>2. Come back here → select <strong>Paste JSON</strong> or <strong>Upload</strong> source → paste/upload <code>models_raw.json</code><br>3. Convert to <code>chatLanguageModels.json</code> → download or copy",
    "sidebar.about": "About",
    "sidebar.collapse": "Collapse",
    "sidebar.editor": "Editor",
    "sidebar.home": "Home",
    "sidebar.lang": "Language",
    "sidebar.log": "Log",
    "sidebar.navigation": "Navigation",
    "sidebar.scripts": "Scripts",
    "sidebar.theme": "Theme",
    "sidebar.title.about": "About",
    "sidebar.title.editor": "Viewer & Editor",
    "sidebar.title.home": "Home",
    "sidebar.title.log": "Activity Log",
    "sidebar.title.scripts": "Scripts",
    "sidebar.title.theme": "Toggle theme",
    "sidebar.utilities": "Utilities",
    "status.add_endpoint": "Add at least one endpoint.",
    "status.add_endpoint_needed": "Add at least one endpoint.",
    "status.cache_cleared": "Cache cleared",
    "status.cache_loaded": "Loaded from cache",
    "status.copied": "Copied to clipboard!",
    "status.copied_clipboard": "Copied to clipboard!",
    "status.copy_failed": "Copy failed.",
    "status.cors_blocked": "Server may be offline or CORS blocked",
    "status.done": "Done! Total: {count} models from {providers} endpoint(s)",
    "status.download_failed": "Download failed: {msg}",
    "status.expected_list": "Expected object=\"list\"",
    "status.fetch_error": "Fetch error: {msg}",
    "status.fetch_failed": "All endpoints failed.",
    "status.fetching": "Fetching all...",
    "status.invalid_json": "Invalid JSON",
    "status.key_required": "Endpoint API Key is required",
    "status.no_endpoints": "No endpoints configured",
    "status.not_json": "Response is not valid JSON",
    "status.paste_required": "Paste JSON first",
    "status.server_html": "Server returned HTML",
    "status.upload_required": "Upload a file first",
    "status.url_required": "Endpoint URL is required",
    "status.validation_title": "Endpoint #{num}: {msg}"
  }

  // --- State ---
  window._langCode = localStorage.getItem(LANG_STORAGE_KEY) || navigator.language?.replace('-', '_') || 'en_US';
  // Normalize: 'en-US' → 'en_US', 'id' → 'id_ID', 'zh-CN' → 'zh_CN', etc.
  if (!window._langCode.includes('_')) {
    const map = { en: 'en_US', id: 'id_ID', zh: 'zh_CN', vi: 'vi_VN', ja: 'ja_JP', fr: 'fr_FR' };
    window._langCode = map[window._langCode] || window._langCode;
  }
  // Only allow known codes
  if (!['en_US', 'id_ID', 'zh_CN', 'vi_VN', 'ja_JP', 'fr_FR'].includes(window._langCode)) window._langCode = 'en_US';

  window._langData = Object.assign({}, FALLBACK_DATA);

  /** Translate key with optional {placeholder} replacements */
  window.t = function (key, replacements) {
    let str = window._langData[key];
    if (str === undefined) str = FALLBACK_DATA[key];
    if (str === undefined) return key;
    if (replacements) {
      for (const [k, v] of Object.entries(replacements)) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
      }
    }
    return str;
  };

  /** Switch language, save, reload */
  window.setLang = function (code) {
    if (code === window._langCode) return;
    localStorage.setItem(LANG_STORAGE_KEY, code);
    // Merge new lang data in-place so t() works immediately
    fetch('lang/' + code + '.json')
      .then(r => r.json())
      .then(data => {
        Object.assign(window._langData, data);
        window._langCode = code;
        // Re-render i18n elements
        if (window._onLangChange) window._onLangChange();
      })
      .catch(() => {
        // Fallback: reload page
        location.reload();
      });
  };

  // --- Async load preferred language ---
  (function loadLang() {
    const code = window._langCode;
    // Always fetch to ensure latest keys (fallback covers offline)
    fetch('lang/' + code + '.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { Object.assign(window._langData, data); if (window._onLangChange) window._onLangChange(); })
      .catch(() => { window._langCode = 'en_US'; });
  })();
})();
