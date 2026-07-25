/* ============================================
   9Router Model Fetcher & Converter
   For GitHub Copilot Agent Chat
   ============================================ */

let lastResult = null;
const CACHE_KEY = '9router_preview_cache';

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function pasteField(id) {
    navigator.clipboard.readText().then(text => {
        $(id).value = text.trim();
        $(id).dispatchEvent(new Event('input'));
    }).catch(() => {});
}

// --- Theme toggle ---

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light');
    localStorage.setItem('9router_theme', body.classList.contains('light') ? 'light' : 'dark');
}

// Apply saved theme on load
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
    return buildEndpoint(apiUrl).replace(/\/models\/?$/, '').replace(/\/+$/, '') + '/v1';
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

    for (const model of (raw.data || [])) {
        const mid = model.id || '';
        if (seen.has(mid)) continue;
        seen.add(mid);

        const cap = model.capabilities || {};
        models.push({
            id: mid,
            name: mid,
            url: modelsUrl,
            toolCalling: !!cap.tools,
            vision: !!cap.vision,
            maxInputTokens: cap.contextWindow || 128000,
            maxOutputTokens: cap.maxOutput || 64000
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

function updateLineNumbers() {
    const textarea = $('preview');
    const nums = $('lineNumbers');
    if (!textarea || !nums) return;
    const lines = (textarea.value || '').split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
        html += '<span>' + i + '</span>';
    }
    nums.innerHTML = html;
}

function showResult(data, total) {
    lastResult = data;
    const json = JSON.stringify(data, null, '\t');
    setStatus(`Done! Total: ${total} models loaded from API`, 'ok');
    const editorWrap = $('editorWrap');
    editorWrap.className = 'editor-wrap show';
    const preview = $('preview');
    preview.value = json;
    updateLineNumbers();
    // Sync scroll
    preview.addEventListener('scroll', () => { $('lineNumbers').scrollTop = preview.scrollTop; });
    $('actions').className = 'actions show';
    saveCache(json);
}

// --- Cache (localStorage) ---

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
        JSON.parse(cached); // validate
        $('editorWrap').className = 'editor-wrap show';
        const preview = $('preview');
        preview.value = cached;
        updateLineNumbers();
        preview.addEventListener('scroll', () => { $('lineNumbers').scrollTop = preview.scrollTop; });
        $('actions').className = 'actions show';
        lastResult = JSON.parse(cached);
        showCacheBar();
        setStatus('Loaded from cache', 'info');
        setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 2000);
    } catch { localStorage.removeItem(CACHE_KEY); }
}

function showCacheBar() {
    const bar = $('cacheBar');
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) { bar.className = 'cache-bar'; return; }
        const size = new Blob([raw]).size;
        const kb = (size / 1024).toFixed(1);
        const models = JSON.parse(raw);
        const count = (models[0] && models[0].models) ? models[0].models.length : '?';
        $('cacheInfo').textContent = `Cached: ${count} models (${kb} KB)`;
        bar.className = 'cache-bar show';
    } catch { bar.className = 'cache-bar'; }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    $('preview').value = '';
    $('editorWrap').className = 'editor-wrap hidden';
    $('lineNumbers').innerHTML = '';
    $('cacheBar').className = 'cache-bar';
    $('actions').className = 'actions';
    lastResult = null;
    setStatus('Cache cleared', 'info');
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
    $('actions').className = 'actions';
}

// --- Fetch mode ---

async function runFetch() {
    const btn = $('fetchBtn');
    const apiUrl = $('apiUrl').value.trim();
    const apiKey = $('apiKeyValue').value.trim();

    if (!apiUrl) { setStatus('Endpoint is required.', 'err'); return; }
    if (!apiKey) { setStatus('API Key / Token is required.', 'err'); return; }

    const corsHint = $('corsHint');
    corsHint.classList.toggle('hidden', !isMixedContent(apiUrl));

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Fetching...';
    $('editorWrap').className = 'editor-wrap hidden';
    $('actions').className = 'actions';

    const endpoint = buildEndpoint(apiUrl);
    const modelsUrl = extractBaseUrl(apiUrl);

    try {
        const resp = await fetch(endpoint, {
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
        });

        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const body = await resp.text().catch(() => '');

        // Detect HTML error page
        if (ct.includes('text/html') || body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
            const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
            const h2Match = body.match(/<h2[^>]*>([^<]+)<\/h2>/i);
            const errMsg = (titleMatch && titleMatch[1]) || (h2Match && h2Match[1]) || 'Server returned HTML instead of JSON';
            let hint = '';
            if (body.includes('Cloudflare')) {
                if (body.includes('Error 1016') || body.includes('Origin DNS error'))
                    hint = '\n\nTunnel expired or not running. Restart Cloudflare tunnel.';
                else if (body.includes('Error 502') || body.includes('Bad gateway'))
                    hint = '\n\nOrigin server is down. Make sure 9Router is running.';
                else if (body.includes('Error 521'))
                    hint = '\n\nOrigin server refused connection.';
                else
                    hint = '\n\nCloudflare error — check tunnel/server status.';
            }
            throw new Error(`HTTP ${resp.status}: ${errMsg}${hint}`);
        }

        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}\n${body}`);

        let raw;
        try { raw = JSON.parse(body); } catch { throw new Error('Response is not valid JSON.'); }
        if (raw.object !== 'list') throw new Error('Invalid response: expected object="list", got "' + (raw.object || 'missing') + '"');

        const { result, total } = convertModels(raw, modelsUrl, $('providerName').value.trim(), apiKey);
        showResult(result, total);

    } catch (e) {
        lastResult = null;
        let msg = e.message || String(e);
        if (msg.length > 500) msg = msg.substring(0, 500) + '...';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            if (isMixedContent(apiUrl))
                msg += '\n\n🔒 HTTPS page cannot fetch HTTP. Use Paste tab or open via file://';
            else if (isLocalhost(apiUrl))
                msg += '\n\nTip: Make sure 9Router is running.';
            else
                msg += '\n\nTip: Server must enable CORS (Access-Control-Allow-Origin: *).';
            corsHint.classList.remove('hidden');
        }
        setStatus(msg, 'err');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Fetch & Convert';
    }
}

// --- Paste mode ---

function runPaste() {
    const rawText = $('pasteInput').value.trim();
    if (!rawText) { setStatus('Paste JSON response first.', 'err'); return; }

    let raw;
    try { raw = JSON.parse(rawText); } catch { setStatus('Invalid JSON. Paste the raw output from /v1/models.', 'err'); return; }
    if (raw.object !== 'list') { setStatus('Invalid format: expected object="list". Got "' + (raw.object || 'missing') + '"', 'err'); return; }

    const apiUrl = $('apiUrl').value.trim() || 'http://localhost:20128';
    const modelsUrl = extractBaseUrl(apiUrl);
    const { result, total } = convertModels(raw, modelsUrl, $('pasteProviderName').value.trim(), $('pasteApiKey').value.trim());
    showResult(result, total);
}

// --- Download / Copy ---

function download() {
    const json = $('preview').value.trim();
    if (!json) return;
    const outFile = $('pastePanel').classList.contains('hidden')
        ? ($('outputFile').value.trim() || 'chatLanguageModels.json')
        : ($('pasteOutputFile').value.trim() || 'chatLanguageModels.json');
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = outFile;
    a.click();
    URL.revokeObjectURL(a.href);
}

async function copyToClipboard() {
    const json = $('preview').value.trim();
    if (!json) return;
    try {
        await navigator.clipboard.writeText(json);
        setStatus('Copied to clipboard!', 'info');
        setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 2000);
    } catch { setStatus('Copy failed. Select from preview manually.', 'err'); }
}
// --- Download scripts (inject form values) ---

async function downloadScript(file) {
    try {
        const resp = await fetch('scripts/' + file);
        if (!resp.ok) throw new Error('Failed to load ' + file);
        let content = await resp.text();

        // Always inject from form
        const apiUrl = $('apiUrl').value.trim() || 'http://localhost:20128/v1/models';
        const apiKey = $('apiKeyValue').value.trim();
        const outputFile = $('outputFile').value.trim() || 'chatLanguageModels.json';

        // Replace API URL
        const endpoint = buildEndpoint(apiUrl);
        const base = extractBaseUrl(apiUrl);
        content = content.replace(/http:\/\/localhost:20128\/v1\/models/g, endpoint);
        content = content.replace(/http:\/\/localhost:20128\/v1/g, base);

        // Inject provider name
        const providerName = $('providerName').value.trim() || '9Router';
        content = content.replace(/"name":"9Router"/g, '"name":"' + providerName.replace(/"/g, '\\"') + '"');
        content = content.replace(/"name": "9Router"/g, '"name": "' + providerName.replace(/"/g, '\\"') + '"');

        // Inject API key (unified: DEFAULT_API_KEY used for both auth and output)
        const scriptApiKey = apiKey || '${input:chat.lm.secret.-65d90303}';
        content = content.replace(/DEFAULT_API_KEY = ""/g, 'DEFAULT_API_KEY = "' + apiKey.replace(/"/g, '\\"') + '"');
        content = content.replace(/DEFAULT_API_KEY=""/g, 'DEFAULT_API_KEY="' + apiKey.replace(/"/g, '\\"') + '"');
        content = content.replace(/set "DEFAULT_API_KEY="/g, 'set "DEFAULT_API_KEY=' + apiKey.replace(/"/g, '""') + '"');
        content = content.replace(/DEFAULT_API_KEY = "\\?\$\{input:chat\.lm\.secret\.-65d90303\}"/g, 'DEFAULT_API_KEY = "' + scriptApiKey.replace(/"/g, '\\"') + '"');

        // Replace output filename
        if (outputFile !== 'chatLanguageModels.json') {
            content = content.replace(/chatLanguageModels\.json/g, outputFile);
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        URL.revokeObjectURL(a.href);
    } catch (e) {
        setStatus('Download failed: ' + e.message, 'err');
    }
}

// --- File upload ---

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        try {
            const parsed = JSON.parse(text);
            if (parsed.object !== 'list') {
                setStatus('Invalid format: expected object="list". Got "' + (parsed.object || 'missing') + '"', 'err');
                return;
            }
            $('pasteInput').value = text;
            $('uploadZone').classList.add('has-file');
            setStatus('File loaded: ' + file.name + ' (' + (parsed.data || []).length + ' models)', 'info');
            setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 3000);
        } catch {
            setStatus('Invalid JSON in uploaded file.', 'err');
        }
    };
    reader.readAsText(file);
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    // Auto-save edits + update line numbers
    const preview = $('preview');
    let saveTimer;
    preview.addEventListener('input', () => {
        updateLineNumbers();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const val = preview.value.trim();
            if (val) {
                try { JSON.parse(val); saveCache(val); lastResult = JSON.parse(val); } catch {}
            }
        }, 500);
    });
    preview.addEventListener('scroll', () => { $('lineNumbers').scrollTop = preview.scrollTop; });

    // Enter key triggers fetch
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !$('fetchBtn').disabled
            && !$('fetchPanel').classList.contains('hidden')) runFetch();
    });

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
