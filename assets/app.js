/* ============================================
   VSCode Modelator
   Bridge your OpenAI compatible models to
   Visual Studio Code custom models.
   ============================================ */

let lastResult = null;
const CACHE_KEY = '9router_preview_cache';
const EP_CACHE_KEY = '9router_endpoints';
let logEntries = [];
let editMode = false;
let endpointIdCounter = 0;

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
            let j = i + 1;
            while (j < len && json[j] !== '"') { if (json[j] === '\\') j++; j++; }
            j++;
            const str = json.substring(i, j);
            let k = j;
            while (k < len && json[k] === ' ') k++;
            if (json[k] === ':') {
                html += '<span class="json-key">' + escHtml(str) + '</span>';
            } else {
                html += '<span class="json-string">' + escHtml(str) + '</span>';
            }
            i = j;
        } else if (ch === '{' || ch === '}') {
            html += '<span class="json-brace">' + ch + '</span>'; i++;
        } else if (ch === '[' || ch === ']') {
            html += '<span class="json-bracket">' + ch + '</span>'; i++;
        } else if (ch === ':') {
            html += '<span class="json-colon">:</span>'; i++;
        } else if (ch === ',') {
            html += '<span class="json-comma">,</span>'; i++;
        } else if (ch === 't' && json.substring(i, i + 4) === 'true') {
            html += '<span class="json-boolean">true</span>'; i += 4;
        } else if (ch === 'f' && json.substring(i, i + 5) === 'false') {
            html += '<span class="json-boolean">false</span>'; i += 5;
        } else if (ch === 'n' && json.substring(i, i + 4) === 'null') {
            html += '<span class="json-null">null</span>'; i += 4;
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
            html += escHtml(ch); i++;
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
    for (let i = 1; i <= lines; i++) html += '<span>' + i + '</span>';
    $('lineNumbers').innerHTML = html;
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

// --- Endpoint list management ---

function getEndpointData() {
    const rows = $('endpointList').querySelectorAll('.endpoint-row');
    const data = [];
    rows.forEach(row => {
        data.push({
            name: row.querySelector('.ep-name')?.value?.trim() || '',
            url: row.querySelector('.ep-url')?.value?.trim() || '',
            key: row.querySelector('.ep-key')?.value?.trim() || '',
        });
    });
    return data;
}

function saveEndpoints() {
    const data = getEndpointData();
    try { localStorage.setItem(EP_CACHE_KEY, JSON.stringify(data)); } catch {}
}

function addEndpoint(name, url, key) {
    endpointIdCounter++;
    const id = endpointIdCounter;
    const row = document.createElement('div');
    row.className = 'endpoint-row';
    row.dataset.id = id;
    row.innerHTML = `
        <div class="endpoint-row-header">
            <span class="endpoint-row-num"><span class="material-symbols-outlined">dns</span> Endpoint #${id}</span>
            <div class="endpoint-row-actions">
                <button type="button" class="panel-btn" onclick="fetchSingleEndpoint(${id})" title="Fetch this endpoint"><span class="material-symbols-outlined">bolt</span></button>
                <button type="button" class="panel-btn" onclick="removeEndpoint(${id})" title="Remove"><span class="material-symbols-outlined">close</span></button>
            </div>
        </div>
        <div class="field">
            <label><span class="material-symbols-outlined label-icon">badge</span> Endpoint Name</label>
            <div class="input-row">
                <input type="text" class="ep-name" value="${escHtml(name || '9Router')}" placeholder="Provider name">
            </div>
        </div>
        <div class="field">
            <label><span class="material-symbols-outlined label-icon">link</span> Endpoint URL</label>
            <div class="input-row">
                <input type="text" class="ep-url" value="${escHtml(url || '')}" placeholder="http://localhost:20128/v1/models">
                <button type="button" class="paste-btn" onclick="pasteField(this.closest('.endpoint-row').querySelector('.ep-url').id)" title="Paste"><span class="material-symbols-outlined">content_paste</span></button>
            </div>
        </div>
        <div class="field">
            <label><span class="material-symbols-outlined label-icon">key</span> API Key / Token</label>
            <div class="input-row">
                <input type="password" class="ep-key" value="${escHtml(key || '')}" placeholder="sk-xxxxx or \${input:chat.lm.secret.-65d90303}">
                <button type="button" class="paste-btn" onclick="pasteField(this.closest('.endpoint-row').querySelector('.ep-key').id)" title="Paste"><span class="material-symbols-outlined">content_paste</span></button>
            </div>
        </div>
        <div class="ep-status" id="epStatus${id}"></div>
    `;
    // Assign unique IDs for paste targets
    row.querySelector('.ep-url').id = `epUrl_${id}`;
    row.querySelector('.ep-key').id = `epKey_${id}`;

    // Listen for changes to save
    row.querySelectorAll('input').forEach(inp => inp.addEventListener('change', saveEndpoints));

    $('endpointList').appendChild(row);
    saveEndpoints();
    log('action', `Added endpoint #${id}`);
    return row;
}

function removeEndpoint(id) {
    const row = $('endpointList').querySelector(`[data-id="${id}"]`);
    if (row) {
        row.remove();
        saveEndpoints();
        log('action', `Removed endpoint #${id}`);
        renumberEndpoints();
    }
}

function renumberEndpoints() {
    const rows = $('endpointList').querySelectorAll('.endpoint-row');
    rows.forEach((row, i) => {
        const num = i + 1;
        row.querySelector('.endpoint-row-num').innerHTML = `<span class="material-symbols-outlined">dns</span> Endpoint #${num}`;
    });
}

function setEndpointStatus(id, type, msg) {
    const el = $(`epStatus${id}`);
    if (!el) return;
    const icons = { loading: 'progress_activity', ok: 'check_circle', err: 'error', idle: '' };
    const cls = { loading: 'ep-loading', ok: 'ep-ok', err: 'ep-err', idle: '' };
    el.className = 'ep-status ' + (cls[type] || '');
    el.innerHTML = type === 'idle' ? '' : `<span class="material-symbols-outlined">${icons[type] || ''}</span> ${escHtml(msg)}`;
}

function loadEndpoints() {
    try {
        const raw = localStorage.getItem(EP_CACHE_KEY);
        if (!raw) { addEndpoint('9Router', 'http://localhost:20128/v1/models', ''); return; }
        const data = JSON.parse(raw);
        if (!Array.isArray(data) || data.length === 0) {
            addEndpoint('9Router', 'http://localhost:20128/v1/models', '');
        } else {
            data.forEach(ep => addEndpoint(ep.name, ep.url, ep.key));
        }
    } catch {
        addEndpoint('9Router', 'http://localhost:20128/v1/models', '');
    }
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
        provider: {
            name: providerName || '9Router',
            vendor: 'customendpoint',
            apiKey: apiKey || '${input:chat.lm.secret.-65d90303}',
            apiType: 'chat-completions',
            models
        },
        total: models.length
    };
}

// --- Result display ---

function showResult(data, total) {
    lastResult = data;
    const json = JSON.stringify(data, null, '\t');
    const providerCount = Array.isArray(data) ? data.length : 1;
    setStatus(`Done! Total: ${total} models from ${providerCount} endpoint(s)`, 'ok');
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
    log('success', `Conversion complete: ${total} models from ${providerCount} endpoint(s)`);
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
        let count = 0;
        if (Array.isArray(lastResult)) {
            lastResult.forEach(p => { count += (p.models || []).length; });
        } else {
            count = lastResult[0]?.models?.length || 0;
        }
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
        let count = 0;
        if (Array.isArray(models)) {
            models.forEach(p => { count += (p.models || []).length; });
        } else {
            count = (models[0] && models[0].models) ? models[0].models.length : '?';
        }
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

// --- Fetch single endpoint ---

async function fetchSingleEndpoint(id) {
    const row = $('endpointList').querySelector(`[data-id="${id}"]`);
    if (!row) return;

    const name = row.querySelector('.ep-name')?.value?.trim() || '';
    const url = row.querySelector('.ep-url')?.value?.trim() || '';
    const key = row.querySelector('.ep-key')?.value?.trim() || '';

    if (!url) { setEndpointStatus(id, 'err', 'Endpoint URL is required'); log('error', `Endpoint #${id}: URL required`); return; }
    if (!key) { setEndpointStatus(id, 'err', 'API Key is required'); log('error', `Endpoint #${id}: API Key required`); return; }

    setEndpointStatus(id, 'loading', 'Fetching...');
    log('action', `Fetching endpoint #${id}: ${url}`);

    const endpoint = buildEndpoint(url);
    const modelsUrl = extractBaseUrl(url);

    try {
        const resp = await fetch(endpoint, {
            headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
        });

        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        const body = await resp.text().catch(() => '');

        if (ct.includes('text/html') || body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
            const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
            const errMsg = (titleMatch && titleMatch[1]) || 'Server returned HTML';
            throw new Error(`HTTP ${resp.status}: ${errMsg}`);
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

        let raw;
        try { raw = JSON.parse(body); } catch { throw new Error('Response is not valid JSON'); }
        if (raw.object !== 'list') throw new Error('Expected object="list"');

        const modelCount = (raw.data || []).length;
        setEndpointStatus(id, 'ok', `${modelCount} models received`);
        log('success', `Endpoint #${id} (${name || url}): ${modelCount} models`);

        const { provider } = convertModels(raw, modelsUrl, name, key);
        return provider;

    } catch (e) {
        let msg = e.message || String(e);
        if (msg.includes('Failed to fetch')) msg += ' — Server may be offline or CORS blocked';
        setEndpointStatus(id, 'err', msg);
        log('error', `Endpoint #${id}: ${msg}`);
        return null;
    }
}

// --- Fetch all endpoints ---

async function runFetchAll() {
    const btn = $('fetchBtn');
    const rows = $('endpointList').querySelectorAll('.endpoint-row');
    if (rows.length === 0) { setStatus('Add at least one endpoint.', 'err'); log('error', 'No endpoints configured'); return; }

    // Validate all
    for (let i = 0; i < rows.length; i++) {
        const url = rows[i].querySelector('.ep-url')?.value?.trim();
        const key = rows[i].querySelector('.ep-key')?.value?.trim();
        if (!url || !key) {
            setStatus(`Endpoint #${i + 1}: URL and API Key are required.`, 'err');
            log('error', `Endpoint #${i + 1}: URL and API Key required`);
            return;
        }
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Fetching all...';
    $('editorEmpty').classList.remove('hidden');
    $('editorContent').classList.add('hidden');

    log('action', `Fetching ${rows.length} endpoint(s)...`);

    // Check mixed content for any
    let hasMixed = false;
    rows.forEach(row => {
        if (isMixedContent(row.querySelector('.ep-url')?.value?.trim())) hasMixed = true;
    });
    $('corsHint').classList.toggle('hidden', !hasMixed);

    const allProviders = [];
    let totalModels = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const url = row.querySelector('.ep-url')?.value?.trim();
        const key = row.querySelector('.ep-key')?.value?.trim();
        const name = row.querySelector('.ep-name')?.value?.trim() || '';
        const rowId = parseInt(row.dataset.id);

        const provider = await fetchSingleEndpoint(rowId);
        if (provider) {
            allProviders.push(provider);
            totalModels += provider.models.length;
        }
    }

    if (allProviders.length === 0) {
        setStatus('All endpoints failed.', 'err');
        log('error', 'All endpoints failed');
    } else {
        showResult(allProviders, totalModels);
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="material-symbols-outlined btn-icon">bolt</span> Fetch All & Merge';
}

// --- Paste mode ---

function runPaste() {
    const rawText = $('pasteInput').value.trim();
    if (!rawText) { setStatus('Paste JSON response first.', 'err'); log('error', 'No JSON pasted'); return; }

    let raw;
    try { raw = JSON.parse(rawText); } catch { setStatus('Invalid JSON.', 'err'); log('error', 'Invalid JSON pasted'); return; }
    if (raw.object !== 'list') { setStatus('Invalid format: expected object="list".', 'err'); log('error', 'Invalid format: expected object="list"'); return; }

    log('action', 'Converting pasted JSON');
    const modelsUrl = 'http://localhost:20128/v1';
    const { provider } = convertModels(raw, modelsUrl, $('pasteProviderName').value.trim(), $('pasteApiKey').value.trim());
    showResult([provider], provider.models.length);
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

        const firstRow = $('endpointList').querySelector('.endpoint-row');
        const apiUrl = firstRow?.querySelector('.ep-url')?.value?.trim() || 'http://localhost:20128/v1/models';
        const apiKey = firstRow?.querySelector('.ep-key')?.value?.trim() || '';
        const outputFile = $('outputFile').value.trim() || 'chatLanguageModels.json';

        const endpoint = buildEndpoint(apiUrl);
        const base = extractBaseUrl(apiUrl);
        content = content.replace(/http:\/\/localhost:20128\/v1\/models/g, endpoint);
        content = content.replace(/http:\/\/localhost:20128\/v1/g, base);

        const providerName = firstRow?.querySelector('.ep-name')?.value?.trim() || '9Router';
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

// --- Dynamic curl command (paste panel) ---

function updateCurlCommand() {
    const url = ($('pasteInput')?.closest('.container')?.querySelector('.ep-url')?.value || '').trim() || 'http://localhost:20128/v1/models';
    const key = 'YOUR_TOKEN';
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

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
    log('info', 'VSCode Modelator initialized');

    // Load endpoints
    loadEndpoints();

    // Auto-save textarea edits
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
            && !$('fetchPanel').classList.contains('hidden')) runFetchAll();
    });

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

    // Restore cache
    loadCache();
});