/* ============================================
   VSCode Modelator
   Bridge your OpenAI compatible models to
   Visual Studio Code custom models.
   ============================================ */

let lastResult = null;
const CACHE_KEY = '9router_preview_cache';
let logEntries = [];
let editMode = false;

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function pasteField(id) {
    navigator.clipboard.readText().then(text => {
        $(id).value = text.trim();
        $(id).dispatchEvent(new Event('input'));
        log('info', `Pasted into #${id}`);
    }).catch(() => { log('warn', 'Clipboard access denied'); });
}

// --- Logging ---

function log(type, msg) {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const icons = { info: 'info', success: 'check_circle', error: 'error', warn: 'warning', action: 'touch_app' };
    const icon = icons[type] || 'info';
    logEntries.push({ time, type, msg });
    const container = $('logEntries');
    const empty = $('logEmpty');
    if (empty) empty.classList.add('hidden');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">${time}</span><span class="material-symbols-outlined log-icon">${icon}</span><span class="log-msg">${escHtml(msg)}</span>`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
    $('logCount').textContent = logEntries.length;
}

function clearLog() {
    logEntries = [];
    const container = $('logEntries');
    container.innerHTML = '<div class="log-empty" id="logEmpty"><span class="material-symbols-outlined log-empty-icon">receipt_long</span><span>No activity yet</span></div>';
    $('logCount').textContent = '0';
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Panel controls ---

function toggleSidePanel() {
    const panel = $('sidePanel');
    panel.classList.contains('collapsed') ? panel.classList.remove('collapsed') : panel.classList.add('collapsed');
    const btn = $('expandBtn');
    if (btn) btn.style.display = panel.classList.contains('collapsed') ? 'flex' : 'none';
    log('action', panel.classList.contains('collapsed') ? 'Editor panel collapsed' : 'Editor panel expanded');
}

function toggleLogPanel() {
    const panel = $('logPanel');
    panel.classList.toggle('collapsed');
    const icon = $('logToggleIcon');
    icon.textContent = panel.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
}

function toggleEditMode() {
    editMode = !editMode;
    const highlight = $('editorHighlight');
    const textarea = $('preview');
    const icon = $('editModeIcon');
    if (editMode) {
        textarea.value = highlight.textContent;
        highlight.classList.add('hidden');
        textarea.classList.remove('hidden');
        icon.textContent = 'visibility';
        textarea.focus();
        log('action', 'Edit mode enabled');
    } else {
        const val = textarea.value.trim();
        if (val) {
            try {
                const parsed = JSON.parse(val);
                const json = JSON.stringify(parsed, null, '\t');
                renderHighlight(json);
                updateLineNumbers(json);
                saveCache(json);
                lastResult = parsed;
            } catch { renderHighlight(textarea.value); updateLineNumbers(textarea.value); }
        }
        highlight.classList.remove('hidden');
        textarea.classList.add('hidden');
        icon.textContent = 'edit';
        log('action', 'Edit mode disabled — syntax highlighted');
    }
}

// --- Syntax highlighting ---

function highlightJSON(json) {
    let html = '';
    let i = 0;
    const len = json.length;
    while (i < len) {
        const ch = json[i];
        if (ch === '"') {
            // Find end of string
            let j = i + 1;
            while (j < len && json[j] !== '"') {
                if (json[j] === '\\') j++;
                j++;
            }
            j++; // include closing quote
            const str = json.substring(i, j);
            // Check if this is a key (followed by colon)
            let k = j;
            while (k < len && json[k] === ' ') k++;
            if (json[k] === ':') {
                html += '<span class="json-key">' + escHtml(str) + '</span>';
            } else {
                html += '<span class="json-string">' + escHtml(str) + '</span>';
            }
            i = j;
        } else if (ch === '{' || ch === '}') {
            html += '<span class="json-brace">' + ch + '</span>';
            i++;
        } else if (ch === '[' || ch === ']') {
            html += '<span class="json-bracket">' + ch + '</span>';
            i++;
        } else if (ch === ':') {
            html += '<span class="json-colon">:</span>';
            i++;
        } else if (ch === ',') {
            html += '<span class="json-comma">,</span>';
            i++;
        } else if (ch === 't' && json.substring(i, i + 4) === 'true') {
            html += '<span class="json-boolean">true</span>';
            i += 4;
        } else if (ch === 'f' && json.substring(i, i + 5) === 'false') {
            html += '<span class="json-boolean">false</span>';
            i += 5;
        } else if (ch === 'n' && json.substring(i, i + 4) === 'null') {
            html += '<span class="json-null">null</span>';
            i += 4;
        } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
            let j = i;
            if (ch === '-') j++;
            while (j < len && ((json[j] >= '0' && json[j] <= '9') || json[j] === '.' || json[j] === 'e' || json[j] === 'E' || json[j] === '+' || json[j] === '-')) {
                if ((json[j] === '+' || json[j] === '-') && j > i + 1 && json[j-1] !== 'e' && json[j-1] !== 'E') break;
                j++;
            }
            html += '<span class="json-number">' + escHtml(json.substring(i, j)) + '</span>';
            i = j;
        } else {
            html += escHtml(ch);
            i++;
        }
    }
    return html;
}

function renderHighlight(json) {
    $('highlightCode').innerHTML = highlightJSON(json);
}

function updateLineNumbers(json) {
    const lines = (json || '').split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
        html += '<span>' + i + '</span>';
    }
    $('lineNumbers').innerHTML = html;
}

// --- Dynamic curl command ---

function updateCurlCommand() {
    const url = ($('apiUrl')?.value || '').trim() || 'http://localhost:20128/v1/models';
    const key = ($('apiKeyValue')?.value || '').trim() || 'YOUR_TOKEN';
    const endpoint = buildEndpoint(url);
    const cmd = `curl -s -H "Authorization: Bearer ${key}" ${endpoint}`;
    const el = $('curlCommand');
    if (el) el.textContent = cmd;
}

function copyCurlCommand() {
    const el = $('curlCommand');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = el.closest('.hint-box')?.querySelector('.copy-curl-btn');
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined">check</span> Copied!';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
        log('success', 'curl command copied to clipboard');
    }).catch(() => {});
}

// --- Theme toggle ---

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light');
    localStorage.setItem('9router_theme', body.classList.contains('light') ? 'light' : 'dark');
    log('action', `Theme: ${body.classList.contains('light') ? 'light' : 'dark'}`);
}

(function() {
    const saved = localStorage.getItem('9router_theme');
    if (saved === 'light') document.body.classList.add('light');
})();

function setStatus(msg, type) {
    const el = $('status');
    el.textContent = msg;
    el.className = 'status ' + type;
}

// --- URL helpers ---

function buildEndpoint(apiUrl) {
    const base = apiUrl.replace(/\/+$/, '');
    if (base.endsWith('/models')) return base;
    if (base.endsWith('/v1')) return base + '/models';
    return base + '/v1/models';
}

function extractBaseUrl(apiUrl) {
    const base = buildEndpoint(apiUrl).replace(/\/models\/?$/, '').replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : base + '/v1';
}

function isMixedContent(apiUrl) {
    if (location.protocol === 'https:' && /^https?:\/\//.test(apiUrl)) {
        try { return new URL(apiUrl).protocol === 'http:'; } catch {}
    }
    return false;
}

function isLocalhost(url) {
    try {
        const h = new URL(url).hostname;
        return ['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(h);
    } catch { return false; }
}

// --- Core conversion ---

function convertModels(raw, modelsUrl, providerName, apiKey) {
    const models = [];
    const seen = new Set();

    let maxInput = 128000, maxOutput = 64000;
    for (const model of (raw.data || [])) {
        if (model.owned_by === 'combo') continue;
        const cap = model.capabilities || {};
        if (cap.contextWindow && cap.contextWindow > maxInput) maxInput = cap.contextWindow;
        if (cap.maxOutput && cap.maxOutput > maxOutput) maxOutput = cap.maxOutput;
    }

    for (const model of (raw.data || [])) {
        const mid = model.id || '';
        if (seen.has(mid)) continue;
        seen.add(mid);

        const isCombo = model.owned_by === 'combo';
        const cap = model.capabilities || {};
        models.push({
            id: mid,
            name: mid,
            url: modelsUrl,
            toolCalling: isCombo ? true : !!cap.tools,
            vision: isCombo ? true : !!cap.vision,
            maxInputTokens: isCombo ? maxInput : (cap.contextWindow || 128000),
            maxOutputTokens: isCombo ? maxOutput : (cap.maxOutput || 64000)
        });
    }

    return {
        result: [{
            name: providerName || '9Router',
            vendor: 'customendpoint',
            apiKey: apiKey || '${input:chat.lm.secret.-65d90303}',
            apiType: 'chat-completions',
            models
        }],
        total: models.length
    };
}

// --- Result display ---

function showResult(data, total) {
    lastResult = data;
    const json = JSON.stringify(data, null, '\t');
    setStatus(`Done! Total: ${total} models loaded from API`, 'ok');
    $('editorEmpty').classList.add('hidden');
    $('editorContent').classList.remove('hidden');
    $('modelCount').classList.remove('hidden');
    $('modelCount').textContent = total + ' models';
    renderHighlight(json);
    updateLineNumbers(json);
    $('preview').value = json;
    editMode = false;
    $('editorHighlight').classList.remove('hidden');
    $('preview').classList.add('hidden');
    $('editModeIcon').textContent = 'edit';
    saveCache(json);
    log('success', `Conversion complete: ${total} models`);
}

// --- Cache ---

function saveCache(json) {
    try {
        localStorage.setItem(CACHE_KEY, json);
        showCacheBar();
    } catch {}
}

function loadCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return;
        JSON.parse(cached);
        $('editorEmpty').classList.add('hidden');
        $('editorContent').classList.remove('hidden');
        renderHighlight(cached);
        updateLineNumbers(cached);
        $('preview').value = cached;
        lastResult = JSON.parse(cached);
        showCacheBar();
        const count = lastResult[0]?.models?.length || 0;
        if (count) {
            $('modelCount').classList.remove('hidden');
            $('modelCount').textContent = count + ' models';
        }
        setStatus('Loaded from cache', 'info');
        log('info', `Loaded ${count} models from cache`);
        setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 2000);
    } catch { localStorage.removeItem(CACHE_KEY); }
}

function showCacheBar() {
    const bar = $('cacheBar');
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) { bar.classList.add('hidden'); return; }
        const size = new Blob([raw]).size;
        const kb = (size / 1024).toFixed(1);
        const models = JSON.parse(raw);
        const count = (models[0] && models[0].models) ? models[0].models.length : '?';
        $('cacheInfo').textContent = `Cached: ${count} models (${kb} KB)`;
        bar.classList.remove('hidden');
    } catch { bar.classList.add('hidden'); }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    $('preview').value = '';
    $('editorEmpty').classList.remove('hidden');
    $('editorContent').classList.add('hidden');
    $('lineNumbers').innerHTML = '';
    $('highlightCode').innerHTML = '';
    $('cacheBar').classList.add('hidden');
    $('modelCount').classList.add('hidden');
    lastResult = null;
    setStatus('Cache cleared', 'info');
    log('action', 'Cache cleared');
    setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 2000);
}

// --- Tabs ---

function switchTab(tab) {
    $('tabFetch').classList.toggle('active', tab === 'fetch');
    $('tabPaste').classList.toggle('active', tab === 'paste');
    $('tabScripts').classList.toggle('active', tab === 'scripts');
    $('fetchPanel').classList.toggle('hidden', tab !== 'fetch');
    $('pastePanel').classList.toggle('hidden', tab !== 'paste');
    $('scriptsPanel').classList.toggle('hidden', tab !== 'scripts');
    $('status').className = 'status';
    log('action', `Switched to ${tab} tab`);
}

// --- Fetch mode ---

async function runFetch() {
    const btn = $('fetchBtn');
    const apiUrl = $('apiUrl').value.trim();
    const apiKey = $('apiKeyValue').value.trim();

    if (!apiUrl) { setStatus('Endpoint is required.', 'err'); log('error', 'Endpoint is required'); return; }
    if (!apiKey) { setStatus('API Key / Token is required.', 'err'); log('error', 'API Key / Token is required'); return; }

    log('action', `Fetching from ${apiUrl}`);

    const corsHint = $('corsHint');
    corsHint.classList.toggle('hidden', !isMixedContent(apiUrl));

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Fetching...';
    $('editorEmpty').classList.remove('hidden');
    $('editorContent').classList.add('hidden');

    const endpoint = buildEndpoint(apiUrl);
    const modelsUrl = extractBaseUrl(apiUrl);

    try {
        const resp = await fetch(endpoint, {
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
        });

        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const body = await resp.text().catch(() => '');

        if (ct.includes('text/html') || body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
            const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
            const h2Match = body.match(/<h2[^>]*>([^<]+)<\/h2>/i);
            const errMsg = (titleMatch && titleMatch[1]) || (h2Match && h2Match[1]) || 'Server returned HTML instead of JSON';
            let hint = '';
            if (body.includes('Cloudflare')) {
                if (body.includes('Error 1016') || body.includes('Origin DNS error'))
                    hint = '\n\nTunnel expired or not running.';
                else if (body.includes('Error 502') || body.includes('Bad gateway'))
                    hint = '\n\nOrigin server is down.';
                else if (body.includes('Error 521'))
                    hint = '\n\nOrigin server refused connection.';
                else
                    hint = '\n\nCloudflare error.';
            }
            throw new Error(`HTTP ${resp.status}: ${errMsg}${hint}`);
        }

        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}\n${body}`);

        let raw;
        try { raw = JSON.parse(body); } catch { throw new Error('Response is not valid JSON.'); }
        if (raw.object !== 'list') throw new Error('Invalid response: expected object="list", got "' + (raw.object || 'missing') + '"');

        log('info', `Received ${(raw.data||[]).length} models from API`);
        const { result, total } = convertModels(raw, modelsUrl, $('providerName').value.trim(), apiKey);
        showResult(result, total);

    } catch (e) {
        lastResult = null;
        let msg = e.message || String(e);
        if (msg.length > 500) msg = msg.substring(0, 500) + '...';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            if (isMixedContent(apiUrl))
                msg += '\n\n🔒 HTTPS page cannot fetch HTTP.';
            else if (isLocalhost(apiUrl))
                msg += '\n\nTip: Make sure the server is running.';
            else
                msg += '\n\nTip: Server must enable CORS.';
            corsHint.classList.remove('hidden');
        }
        setStatus(msg, 'err');
        log('error', msg.split('\n')[0]);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Fetch & Convert';
    }
}

// --- Paste mode ---

function runPaste() {
    const rawText = $('pasteInput').value.trim();
    if (!rawText) { setStatus('Paste JSON response first.', 'err'); log('error', 'No JSON pasted'); return; }

    let raw;
    try { raw = JSON.parse(rawText); } catch { setStatus('Invalid JSON.', 'err'); log('error', 'Invalid JSON pasted'); return; }
    if (raw.object !== 'list') { setStatus('Invalid format: expected object="list".', 'err'); log('error', 'Invalid format: expected object="list"'); return; }

    log('action', 'Converting pasted JSON');
    const apiUrl = $('apiUrl').value.trim() || 'http://localhost:20128';
    const modelsUrl = extractBaseUrl(apiUrl);
    const { result, total } = convertModels(raw, modelsUrl, $('pasteProviderName').value.trim(), $('pasteApiKey').value.trim());
    showResult(result, total);
}

// --- Download / Copy ---

function download() {
    const json = $('preview').value.trim();
    if (!json) { log('warn', 'Nothing to download'); return; }
    const outFile = $('pastePanel').classList.contains('hidden')
        ? ($('outputFile').value.trim() || 'chatLanguageModels.json')
        : ($('pasteOutputFile').value.trim() || 'chatLanguageModels.json');
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = outFile;
    a.click();
    URL.revokeObjectURL(a.href);
    log('success', `Downloaded ${outFile}`);
}

async function copyToClipboard() {
    const json = $('preview').value.trim();
    if (!json) { log('warn', 'Nothing to copy'); return; }
    try {
        await navigator.clipboard.writeText(json);
        setStatus('Copied to clipboard!', 'info');
        log('success', 'Copied to clipboard');
        setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 2000);
    } catch { setStatus('Copy failed.', 'err'); log('error', 'Copy failed'); }
}

// --- Download scripts ---

async function downloadScript(file) {
    log('action', `Downloading script: ${file}`);
    try {
        const resp = await fetch('scripts/' + file);
        if (!resp.ok) throw new Error('Failed to load ' + file);
        let content = await resp.text();

        const apiUrl = $('apiUrl').value.trim() || 'http://localhost:20128/v1/models';
        const apiKey = $('apiKeyValue').value.trim();
        const outputFile = $('outputFile').value.trim() || 'chatLanguageModels.json';

        const endpoint = buildEndpoint(apiUrl);
        const base = extractBaseUrl(apiUrl);
        content = content.replace(/http:\/\/localhost:20128\/v1\/models/g, endpoint);
        content = content.replace(/http:\/\/localhost:20128\/v1/g, base);

        const providerName = $('providerName').value.trim() || '9Router';
        content = content.replace(/"name":"9Router"/g, '"name":"' + providerName.replace(/"/g, '\\"') + '"');
        content = content.replace(/"name": "9Router"/g, '"name": "' + providerName.replace(/"/g, '\\"') + '"');

        const scriptApiKey = apiKey || '${input:chat.lm.secret.-65d90303}';
        content = content.replace(/DEFAULT_API_KEY = ""/g, 'DEFAULT_API_KEY = "' + apiKey.replace(/"/g, '\\"') + '"');
        content = content.replace(/DEFAULT_API_KEY=""/g, 'DEFAULT_API_KEY="' + apiKey.replace(/"/g, '\\"') + '"');
        content = content.replace(/set "DEFAULT_API_KEY="/g, 'set "DEFAULT_API_KEY=' + apiKey.replace(/"/g, '""') + '"');
        content = content.replace(/DEFAULT_API_KEY = "\\?\$\{input:chat\.lm\.secret\.-65d90303\}"/g, 'DEFAULT_API_KEY = "' + scriptApiKey.replace(/"/g, '\\"') + '"');

        if (outputFile !== 'chatLanguageModels.json') {
            content = content.replace(/chatLanguageModels\.json/g, outputFile);
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        URL.revokeObjectURL(a.href);
        log('success', `Downloaded ${file}`);
    } catch (e) {
        setStatus('Download failed: ' + e.message, 'err');
        log('error', `Script download failed: ${e.message}`);
    }
}

// --- File upload ---

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    log('action', `Uploading file: ${file.name}`);
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        try {
            const parsed = JSON.parse(text);
            if (parsed.object !== 'list') {
                setStatus('Invalid format: expected object="list".', 'err');
                log('error', 'Invalid format in uploaded file');
                return;
            }
            $('pasteInput').value = text;
            $('uploadZone').classList.add('has-file');
            setStatus('File loaded: ' + file.name + ' (' + (parsed.data || []).length + ' models)', 'info');
            log('success', `File loaded: ${file.name} (${(parsed.data || []).length} models)`);
            setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 3000);
        } catch {
            setStatus('Invalid JSON in uploaded file.', 'err');
            log('error', 'Invalid JSON in uploaded file');
        }
    };
    reader.readAsText(file);
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    log('info', 'VSCode Modelator initialized');

    // Auto-save edits
    const preview = $('preview');
    let saveTimer;
    preview.addEventListener('input', () => {
        const lines = (preview.value || '').split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) html += '<span>' + i + '</span>';
        $('lineNumbers').innerHTML = html;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const val = preview.value.trim();
            if (val) {
                try { JSON.parse(val); saveCache(val); lastResult = JSON.parse(val); } catch {}
            }
        }, 500);
    });

    // Enter key triggers fetch
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !$('fetchBtn').disabled
            && !$('fetchPanel').classList.contains('hidden')) runFetch();
    });

    // Live-update curl command
    ['apiUrl', 'apiKeyValue'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', updateCurlCommand);
    });
    updateCurlCommand();

    // Restore cache
    loadCache();

    // Upload zone drag-and-drop
    const zone = $('uploadZone');
    if (zone) {
        ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragover'); }));
        ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
        zone.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file && file.name.endsWith('.json')) {
                const dt = new DataTransfer(); dt.items.add(file);
                $('fileUpload').files = dt.files;
                handleFileUpload({ target: { files: [file] } });
            }
        });
    }
});
