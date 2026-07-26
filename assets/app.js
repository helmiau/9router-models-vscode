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
let currentView = 'tree'; // 'json' | 'tree'
let endpointIdCounter = 0;
let treeExpanded = {};

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function pasteField(id) {
    navigator.clipboard.readText().then(text => {
        $(id).value = text.trim();
        $(id).dispatchEvent(new Event('input'));
        log('info', `Pasted into #${id}`);
    }).catch(() => { log('warn', 'Clipboard access denied'); });
}

function copyField(id) {
    const el = $(id);
    if (!el) return;
    const text = el.value;
    if (!text) { log('warn', 'Nothing to copy'); return; }
    const btn = el.closest('.input-row')?.querySelector('.copy-btn') || el.closest('.endpoint-row')?.querySelector('.copy-btn');
    if (btn) animateIcon(btn, 'icon-check');
    navigator.clipboard.writeText(text).then(() => {
        log('info', `Copied from #${id}`);
    }).catch(() => { if (btn) animateIcon(btn, 'icon-shake'); log('warn', 'Clipboard access denied'); });
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

/* Toast notification — snackbar at bottom-center */
function showToast(type, msg, durationMs = 3000) {
    const container = $('toastContainer');
    if (!container) return;
    const icons = { ok: 'check_circle', err: 'error', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="material-symbols-outlined">${icons[type] || 'info'}</span><span>${escHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, durationMs);
}

/* Icon micro-feedback: find .material-symbols-outlined inside el, animate it */
function animateIcon(el, animClass) {
    const icon = el?.querySelector?.('.material-symbols-outlined') || el;
    if (!icon || icon.classList.contains(animClass)) return;
    icon.classList.add(animClass);
    icon.addEventListener('animationend', () => icon.classList.remove(animClass), { once: true });
}

function clearLog() {
    logEntries = [];
    const container = $('logEntries');
    container.innerHTML = '<div class="log-empty" id="logEmpty"><span class="material-symbols-outlined log-empty-icon">receipt_long</span><span>No activity yet</span></div>';
    $('logCount').textContent = '0';
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Panel controls ---

function switchPanel(name) {
    const panels = { form: 'panelForm', editor: 'panelEditor', scripts: 'panelScripts', log: 'panelLog', docs: 'panelDocs', about: 'panelAbout' };
    Object.values(panels).forEach(id => $(id).classList.replace('active', 'hidden'));
    const entering = $(panels[name]);
    entering.classList.replace('hidden', 'active');
    entering.classList.remove('panel-fade-in');
    void entering.offsetWidth;
    entering.classList.add('panel-fade-in');
    document.querySelectorAll('.sidebar-item[data-panel]').forEach(btn => {
        const isActive = btn.dataset.panel === name;
        btn.classList.toggle('active', isActive);
        if (isActive) {
            const visibleIcon = btn.querySelector('.sidebar-icon-filled') || btn.querySelector('.sidebar-icon-outline');
            if (visibleIcon) animateIcon(visibleIcon, 'icon-bounce');
        }
    });
    log('action', `Switched to ${name} panel`);
}

function toggleSidebar() {
    const sb = $('sidebar');
    sb.classList.toggle('expanded');
    $('sidebarToggleIcon').textContent = sb.classList.contains('expanded') ? 'menu' : 'menu_open';
}

function toggleSidePanel() {
    const panel = $('sidePanel');
    panel.classList.toggle('collapsed');
}

function toggleLogPanel() {
    const panel = $('logPanel');
    panel.classList.toggle('collapsed');
    const icon = $('logToggleIcon');
    icon.textContent = panel.classList.contains('collapsed') ? 'expand_more' : 'expand_less';
    animateIcon(icon, 'icon-bounce');
}

// --- Ace Editor ---

let aceEditor = null;

function initAce() {
    const el = document.getElementById('aceEditor');
    if (!el || !window.ace) { console.warn('Ace.js not loaded'); return; }
    aceEditor = ace.edit('aceEditor');
    aceEditor.setTheme('ace/theme/tomorrow_night');
    aceEditor.session.setMode('ace/mode/json');
    aceEditor.setOptions({
        fontSize: '13px',
        fontFamily: "'SF Mono', 'Consolas', 'Courier New', monospace",
        showPrintMargin: false,
        tabSize: 4,
        useSoftTabs: true,
        wrap: false,
        readOnly: true,
        showGutter: true,
        highlightActiveLine: true,
        cursorStyle: 'smooth',
        animatedScroll: true,
    });
    aceEditor.commands.addCommand({ name: 'toggleEdit', bindKey: { win: 'Ctrl-E', mac: 'Cmd-E' }, exec: function() { toggleEditMode(); } });
    aceEditor.commands.addCommand({ name: 'formatJSON', bindKey: { win: 'Shift-Alt-F', mac: 'Shift-Alt-F' }, exec: function() { formatAce(); } });
    aceEditor.commands.addCommand({ name: 'openFindReplace', bindKey: { win: 'Ctrl-H', mac: 'Cmd-Alt-F' }, exec: function() { if ($('editorContent').classList.contains('hidden')) return; switchView('json'); toggleFindBar(); } });
    aceEditor.commands.addCommand({ name: 'openFind', bindKey: { win: 'Ctrl-F', mac: 'Cmd-F' }, exec: function() { if ($('editorContent').classList.contains('hidden')) return; switchView('json'); if ($('findBar').classList.contains('hidden')) toggleFindBar(); $('findInput').focus(); } });
    aceEditor.on('change', function() {
        if (!aceEditor.getReadOnly()) {
            const val = aceEditor.getValue();
            if (val) { try { lastResult = JSON.parse(val); saveCache(val); } catch {} }
        }
    });
    updateAceTheme();
}

function updateAceTheme() {
    if (!aceEditor) return;
    const isDark = !document.body.classList.contains('light');
    aceEditor.setTheme(isDark ? 'ace/theme/tomorrow_night' : 'ace/theme/textmate');
}

function formatAce() {
    if (!aceEditor) return;
    const val = aceEditor.getValue();
    if (!val) { log('warn', 'Nothing to format'); return; }
    try {
        const parsed = JSON.parse(val);
        const formatted = JSON.stringify(parsed, null, '\t');
        aceEditor.setValue(formatted, -1);
        lastResult = parsed;
        saveCache(formatted);
        log('success', 'JSON formatted');
    } catch (e) { log('error', 'Format failed: ' + e.message); }
}

// --- Find & Replace ---

let findMarkers = [];
let findActive = false;

function toggleFindBar() {
    const bar = $('findBar');
    bar.classList.toggle('hidden');
    findActive = !bar.classList.contains('hidden');
    $('findReplaceBtn').classList.toggle('active', findActive);
    if (findActive) {
        $('findInput').focus();
        const sel = aceEditor.getSelectedText();
        if (sel) { $('findInput').value = sel; doFind(); }
    } else {
        clearFindMarkers();
    }
}

function closeFindBar() {
    $('findBar').classList.add('hidden');
    findActive = false;
    $('findReplaceBtn').classList.remove('active');
    clearFindMarkers();
    if (aceEditor) aceEditor.focus();
}

function toggleReplaceRow() {
    $('replaceRow').classList.toggle('hidden');
    const icon = $('toggleReplaceBtn').querySelector('.material-symbols-outlined');
    icon.textContent = $('replaceRow').classList.contains('hidden') ? 'expand_more' : 'expand_less';
}

function clearFindMarkers() {
    if (!aceEditor) return;
    const session = aceEditor.getSession();
    findMarkers.forEach(id => session.removeMarker(id));
    findMarkers = [];
    $('findCount').textContent = '';
}

function doFind() {
    if (!aceEditor) return;
    clearFindMarkers();
    const query = $('findInput').value;
    if (!query) { $('findCount').textContent = ''; return; }
    const session = aceEditor.getSession();
    const doc = session.getDocument();
    const lines = doc.getAllLines();
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let count = 0;
    const Range = ace.require('ace/range').Range;
    for (let i = 0; i < lines.length; i++) {
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(lines[i])) !== null) {
            const range = new Range(i, m.index, i, m.index + m[0].length);
            const markerId = session.highlight(range, 'findHighlight', 'text');
            findMarkers.push(markerId);
            count++;
        }
    }
    $('findCount').textContent = count ? count + ' found' : 'No match';
}

function findNext() {
    if (!aceEditor || !$('findInput').value) return;
    aceEditor.findNext({ wrap: true, caseSensitive: false, wholeWord: false });
    updateFindCount();
}

function findPrev() {
    if (!aceEditor || !$('findInput').value) return;
    aceEditor.findPrevious({ wrap: true, caseSensitive: false, wholeWord: false });
    updateFindCount();
}

function updateFindCount() {
    const match = aceEditor.getSelectionRange();
    // We rely on Ace's built-in search count via status
}

function replaceOne() {
    if (!aceEditor) return;
    const find = $('findInput').value;
    const repl = $('replaceInput').value;
    if (!find) return;
    const sel = aceEditor.getSelectedText();
    if (sel.toLowerCase() === find.toLowerCase()) {
        aceEditor.replace(repl);
        doFind();
        findNext();
    } else {
        findNext();
    }
}

function replaceAll() {
    if (!aceEditor) return;
    const find = $('findInput').value;
    const repl = $('replaceInput').value;
    if (!find) return;
    aceEditor.replaceAll(repl, { needle: find, caseSensitive: false });
    doFind();
    log('action', `Replaced all "${find}" with "${repl}"`);
}

function toggleEditMode() {
    if (currentView !== 'json' || !aceEditor) return;
    editMode = !editMode;
    aceEditor.setReadOnly(!editMode);
    $('editModeIcon').textContent = editMode ? 'visibility' : 'edit';
    $('editModeLabel').textContent = editMode ? 'View' : 'Edit';
    $('editBtn').classList.toggle('active', editMode);
    animateIcon($('editBtn'), 'icon-fadeswap');
    log('action', editMode ? 'Edit mode enabled' : 'Edit mode disabled');
}

function switchView(view) {
    currentView = view;
    const treeEl = $('treeView');
    const aceEl = $('aceEditor');
    const rightBar = $('editorToolbarRight');
    $('btnViewTree').classList.toggle('active', view === 'tree');
    $('btnViewJson').classList.toggle('active', view === 'json');
    if (view === 'tree') {
        if (treeEl) treeEl.style.display = '';
        if (aceEl) aceEl.classList.add('hidden');
        if (rightBar) rightBar.style.display = 'none';
        if (findActive) closeFindBar();
    } else {
        if (treeEl) treeEl.style.display = 'none';
        if (aceEl) aceEl.classList.remove('hidden');
        if (rightBar) rightBar.style.display = 'flex';
    }
}

function treeToggleId() { return 'tn_' + (++treeIdCounter); }
let treeIdCounter = 0;

function treeValClass(v) {
    if (v === null) return 'tree-val-null';
    if (typeof v === 'boolean') return 'tree-val-bool';
    if (typeof v === 'number') return 'tree-val-num';
    if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) return 'tree-val-url';
    if (typeof v === 'string') return 'tree-val-str';
    return '';
}

function renderTreeView(data) {
    treeIdCounter = 0;
    const container = $('treeView');
    let html = '';
    const items = Array.isArray(data) ? data : [data];

    items.forEach((provider, pi) => {
        const tid = treeToggleId();
        const providerName = provider.name || provider.id || `Provider ${pi + 1}`;
        const models = provider.models || [];
        const isOpen = treeExpanded[tid] !== false; // default open

        html += `<div class="tree-node tree-root">`;
        html += `<div class="tree-row">`;
        html += `<span class="tree-toggle ${isOpen ? '' : 'collapsed'}" onclick="treeToggle('${tid}', this)"><span class="material-symbols-outlined">expand_more</span></span>`;
        html += `<span class="tree-icon tree-icon-provider"><span class="material-symbols-outlined">dns</span></span>`;
        html += `<span class="tree-key">${escHtml(providerName)}</span>`;
        html += `<span class="tree-badge tree-badge-provider">provider</span>`;
        if (provider.vendor) html += `<span class="tree-badge" style="background:var(--color-purple-muted);color:var(--color-purple)">${escHtml(provider.vendor)}</span>`;
        html += `<span class="tree-badge tree-badge-count">${models.length} models</span>`;
        html += `</div>`;

        html += `<div class="tree-node" id="${tid}" style="display:${isOpen ? 'block' : 'none'}">`;

        // Provider metadata
        ['vendor','apiKey','apiType'].forEach(k => {
            if (provider[k] === undefined) return;
            const v = provider[k];
            const display = k === 'apiKey' ? '***' + String(v).slice(-4) : v;
            const cls = treeValClass(v);
            html += `<div class="tree-row">`;
            html += `<span class="tree-toggle-placeholder"></span>`;
            html += `<span class="tree-key">${escHtml(k)}</span>`;
            html += `<span class="tree-sep">:</span>`;
            html += `<span class="${cls || 'tree-val-str'}">${escHtml(display)}</span>`;
            html += `</div>`;
        });

        // Models array header
        const mid = treeToggleId();
        const mOpen = treeExpanded[mid] !== false;
        html += `<div class="tree-row">`;
        html += `<span class="tree-toggle ${mOpen ? '' : 'collapsed'}" onclick="treeToggle('${mid}', this)"><span class="material-symbols-outlined">expand_more</span></span>`;
        html += `<span class="tree-icon tree-icon-array"><span class="material-symbols-outlined">view_list</span></span>`;
        html += `<span class="tree-key">models</span>`;
        html += `<span class="tree-sep">:</span>`;
        html += `<span class="tree-val-num">[${models.length}]</span>`;
        html += `</div>`;

        html += `<div class="tree-node" id="${mid}" style="display:${mOpen ? 'block' : 'none'}">`;

        models.forEach((model, mi) => {
            const modelTid = treeToggleId();
            const mOpenInner = treeExpanded[modelTid] !== false;
            const isCombo = model.toolCalling && model.vision;
            const iconCls = isCombo ? 'tree-icon-combo' : 'tree-icon-model';
            const iconNm = isCombo ? 'auto_awesome' : 'smart_toy';

            html += `<div class="tree-row">`;
            html += `<span class="tree-toggle ${mOpenInner ? '' : 'collapsed'}" onclick="treeToggle('${modelTid}', this)"><span class="material-symbols-outlined">expand_more</span></span>`;
            html += `<span class="tree-icon ${iconCls}"><span class="material-symbols-outlined">${iconNm}</span></span>`;
            html += `<span class="tree-key">${escHtml(model.id || model.name || `model_${mi}`)}</span>`;
            if (isCombo) html += `<span class="tree-badge tree-badge-combo">combo</span>`;
            if (model.vision) html += `<span class="tree-badge tree-badge-vision">vision</span>`;
            if (model.toolCalling) html += `<span class="tree-badge tree-badge-tools">tools</span>`;
            html += `</div>`;

            html += `<div class="tree-node" id="${modelTid}" style="display:${mOpenInner ? 'block' : 'none'}">`;
            Object.keys(model).forEach(k => {
                const v = model[k];
                const cls = treeValClass(v);
                const display = k === 'url' ? String(v).replace(/^https?:\/\/[^/]+/, '') : v;
                html += `<div class="tree-row">`;
                html += `<span class="tree-toggle-placeholder"></span>`;
                html += `<span class="tree-key">${escHtml(k)}</span>`;
                html += `<span class="tree-sep">:</span>`;
                html += `<span class="${cls}">${escHtml(display)}</span>`;
                html += `</div>`;
            });
            html += `</div>`; // model props
        });

        html += `</div>`; // models array
        html += `</div>`; // provider props
        html += `</div>`; // provider root
    });

    container.innerHTML = html;
}

function treeToggle(id, el) {
    const node = $(id);
    if (!node) return;
    const visible = node.style.display !== 'none';
    node.style.display = visible ? 'none' : 'block';
    el.classList.toggle('collapsed', visible);
    treeExpanded[id] = !visible;
}

// --- Find & Replace ---

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light');
    localStorage.setItem('9router_theme', body.classList.contains('light') ? 'light' : 'dark');
    updateAceTheme();
    const btn = $('sidebarThemeBtn');
    const visibleIcon = body.classList.contains('light') ? btn.querySelector('.icon-light') : btn.querySelector('.icon-dark');
    if (visibleIcon) animateIcon(visibleIcon, 'icon-fadeswap');
    log('action', `Theme: ${body.classList.contains('light') ? 'light' : 'dark'}`);
}

(function() {
    const saved = localStorage.getItem('9router_theme');
    if (saved === 'light') document.body.classList.add('light');
})();

function setStatus(msg, type) {
    const el = $('status');
    el.textContent = msg;
    el.classList.remove('panel-fade-in', 'status-enter');
    void el.offsetWidth;
    el.className = 'status ' + type + ' status-enter';
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
            apiType: row.querySelector('.ep-apiType-wrap')?.dataset?.value || 'chat-completions',
        });
    });
    return data;
}

function saveEndpoints() {
    const data = getEndpointData();
    try { localStorage.setItem(EP_CACHE_KEY, JSON.stringify(data)); } catch {}
}

function addEndpoint(name, url, key, apiType) {
    endpointIdCounter++;
    const id = endpointIdCounter;
    const at = apiType || 'chat-completions';
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
                <button type="button" class="copy-btn" onclick="copyField(this.closest('.endpoint-row').querySelector('.ep-name').id)" title="Copy"><span class="material-symbols-outlined">content_copy</span></button>
                <button type="button" class="paste-btn" onclick="pasteField(this.closest('.endpoint-row').querySelector('.ep-name').id)" title="Paste"><span class="material-symbols-outlined">content_paste</span></button>
            </div>
        </div>
        <div class="field">
            <label><span class="material-symbols-outlined label-icon">link</span> Endpoint URL</label>
            <div class="input-row">
                <input type="text" class="ep-url" value="${escHtml(url || '')}" placeholder="http://localhost:20128/v1/models">
                <button type="button" class="copy-btn" onclick="copyField(this.closest('.endpoint-row').querySelector('.ep-url').id)" title="Copy"><span class="material-symbols-outlined">content_copy</span></button>
                <button type="button" class="paste-btn" onclick="pasteField(this.closest('.endpoint-row').querySelector('.ep-url').id)" title="Paste"><span class="material-symbols-outlined">content_paste</span></button>
            </div>
        </div>
        <div class="field">
            <label><span class="material-symbols-outlined label-icon">key</span> API Key / Token</label>
            <div class="input-row">
                <input type="password" class="ep-key" value="${escHtml(key || '')}" placeholder="sk-xxxxx or \${input:chat.lm.secret.-65d90303}">
                <button type="button" class="copy-btn" onclick="copyField(this.closest('.endpoint-row').querySelector('.ep-key').id)" title="Copy"><span class="material-symbols-outlined">content_copy</span></button>
                <button type="button" class="paste-btn" onclick="pasteField(this.closest('.endpoint-row').querySelector('.ep-key').id)" title="Paste"><span class="material-symbols-outlined">content_paste</span></button>
            </div>
        </div>
        <div class="field">
            <label><span class="material-symbols-outlined label-icon">api</span> API Type</label>
            <div class="ep-apiType-wrap" data-value="${escHtml(at)}">
                <div class="ep-apiType-input-row">
                    <input type="text" class="ep-apiType-text" value="${escHtml(at === 'chat-completions' ? 'Chat Completions' : at === 'responses' ? 'Responses' : 'Messages')}" placeholder="Select API type" readonly autocomplete="off" spellcheck="false">
                    <button type="button" class="ep-apiType-toggle" tabindex="-1"><span class="material-symbols-outlined">expand_more</span></button>
                </div>
                <div class="ep-apiType-dropdown"></div>
            </div>
        </div>
        <div class="ep-status" id="epStatus${id}"></div>
    `;
    // Assign unique IDs for paste targets
    row.querySelector('.ep-url').id = `epUrl_${id}`;
    row.querySelector('.ep-key').id = `epKey_${id}`;
    row.querySelector('.ep-name').id = `epName_${id}`;

    // Listen for changes to save
    row.querySelectorAll('input').forEach(inp => inp.addEventListener('change', saveEndpoints));

    // Init API Type combobox
    initApiTypeCombobox(row);

    $('endpointList').appendChild(row);
    saveEndpoints();
    log('action', `Added endpoint #${id}`);
    animateIcon(row.querySelector('.endpoint-row-num .material-symbols-outlined'), 'icon-bounce');
    return row;
}

function removeEndpoint(id) {
    const row = $('endpointList').querySelector(`[data-id="${id}"]`);
    if (row) {
        const closeBtn = row.querySelector('.panel-btn');
        if (closeBtn) animateIcon(closeBtn, 'icon-shake');
        row.style.transition = 'opacity 200ms ease, transform 200ms ease';
        row.style.opacity = '0';
        row.style.transform = 'scale(0.95)';
        row.addEventListener('transitionend', () => {
            row.remove();
            saveEndpoints();
            log('action', `Removed endpoint #${id}`);
            renumberEndpoints();
        }, { once: true });
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

// --- API Type Combobox ---

const API_TYPE_OPTIONS = [
    { value: 'chat-completions', label: 'Chat Completions', icon: 'chat', desc: '/v1/chat/completions' },
    { value: 'responses', label: 'Responses', icon: 'smart_toy', desc: '/v1/responses' },
    { value: 'messages', label: 'Messages', icon: 'forum', desc: '/v1/messages' },
];

function initApiTypeCombobox(row) {
    const wrap = row.querySelector('.ep-apiType-wrap');
    if (!wrap) return;
    const inputRow = wrap.querySelector('.ep-apiType-input-row');
    const input = wrap.querySelector('.ep-apiType-text');
    const toggle = wrap.querySelector('.ep-apiType-toggle');
    const dropdown = wrap.querySelector('.ep-apiType-dropdown');
    let activeIdx = -1;
    let blurTimer = null;

    function renderOptions(filter) {
        const q = (filter || '').toLowerCase();
        let html = '';
        let idx = 0;
        API_TYPE_OPTIONS.forEach(opt => {
            if (q && !opt.label.toLowerCase().includes(q) && !opt.value.toLowerCase().includes(q)) return;
            const sel = wrap.dataset.value === opt.value;
            html += `<div class="ep-apiType-opt${sel ? ' selected' : ''}" data-val="${opt.value}" data-idx="${idx}">` +
                `<span class="material-symbols-outlined ep-apiType-opt-icon">${opt.icon}</span>` +
                `<span class="ep-apiType-opt-label">${opt.label}</span>` +
                `<span class="ep-apiType-opt-val">${opt.desc}</span></div>`;
            idx++;
        });
        if (!html) html = `<div class="ep-apiType-opt no-match">No match</div>`;
        dropdown.innerHTML = html;
        // Bind clicks
        dropdown.querySelectorAll('.ep-apiType-opt:not(.no-match)').forEach(el => {
            el.addEventListener('mousedown', e => {
                e.preventDefault();
                selectOption(el.dataset.val);
            });
        });
    }

    function selectOption(val) {
        const opt = API_TYPE_OPTIONS.find(o => o.value === val);
        if (!opt) return;
        wrap.dataset.value = val;
        input.value = opt.label;
        close();
        saveEndpoints();
    }

    function open() {
        clearTimeout(blurTimer);
        renderOptions('');
        activeIdx = -1;
        wrap.classList.add('open');
        input.removeAttribute('readonly');
        input.value = '';
        input.focus();
    }

    function close() {
        wrap.classList.remove('open');
        input.setAttribute('readonly', '');
        const cur = API_TYPE_OPTIONS.find(o => o.value === wrap.dataset.value);
        input.value = cur ? cur.label : wrap.dataset.value;
    }

    function isOpen() { return wrap.classList.contains('open'); }

    function moveActive(dir) {
        const items = dropdown.querySelectorAll('.ep-apiType-opt:not(.no-match)');
        if (!items.length) return;
        items.forEach(el => el.classList.remove('active'));
        activeIdx = (activeIdx + dir + items.length) % items.length;
        items[activeIdx].classList.add('active');
        items[activeIdx].scrollIntoView({ block: 'nearest' });
    }

    toggle.addEventListener('mousedown', e => {
        e.preventDefault();
        isOpen() ? close() : open();
    });

    input.addEventListener('mousedown', e => {
        e.preventDefault();
        isOpen() ? close() : open();
    });

    input.addEventListener('input', () => {
        renderOptions(input.value);
        activeIdx = -1;
    });

    input.addEventListener('keydown', e => {
        if (!isOpen()) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); moveActive(1); break;
            case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
            case 'Enter': {
                e.preventDefault();
                e.stopPropagation();
                const items = dropdown.querySelectorAll('.ep-apiType-opt:not(.no-match)');
                if (activeIdx >= 0 && activeIdx < items.length) {
                    selectOption(items[activeIdx].dataset.val);
                }
                break;
            }
            case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
            case 'Tab': close(); break;
        }
    });

    input.addEventListener('blur', () => {
        blurTimer = setTimeout(close, 150);
    });

    // Prevent dropdown clicks from blurring input
    dropdown.addEventListener('mousedown', e => e.preventDefault());

    // Document-level Escape to close any open combobox
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isOpen()) {
            e.preventDefault();
            close();
        }
    }, true);

    // Initial render
    close();
}

function loadEndpoints() {
    try {
        const raw = localStorage.getItem(EP_CACHE_KEY);
        if (!raw) { addEndpoint('9Router', 'http://localhost:20128/v1/models', ''); return; }
        const data = JSON.parse(raw);
        if (!Array.isArray(data) || data.length === 0) {
            addEndpoint('9Router', 'http://localhost:20128/v1/models', '');
        } else {
            data.forEach(ep => addEndpoint(ep.name, ep.url, ep.key, ep.apiType));
        }
    } catch {
        addEndpoint('9Router', 'http://localhost:20128/v1/models', '');
    }
}

// --- Core conversion ---

function convertModels(raw, modelsUrl, providerName, apiKey, apiType) {
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
            apiType: apiType || 'chat-completions',
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
    showToast('ok', `${total} models from ${providerCount} endpoint(s)`);
    $('editorEmpty').classList.add('hidden');
    const ec = $('editorContent');
    ec.classList.remove('hidden');
    ec.classList.remove('crossfade-in');
    void ec.offsetWidth;
    ec.classList.add('crossfade-in');
    $('modelCount').classList.remove('hidden');
    $('modelCount').textContent = total + ' models';
    renderTreeView(data);
    if (aceEditor) { aceEditor.setValue(json, -1); aceEditor.clearSelection(); }
    editMode = false;
    if (aceEditor) aceEditor.setReadOnly(true);
    $('editModeIcon').textContent = 'edit';
    $('editModeLabel').textContent = 'Edit';
    $('editBtn').classList.remove('active');
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
        lastResult = JSON.parse(cached);
        renderTreeView(lastResult);
        if (aceEditor) { aceEditor.setValue(cached, -1); aceEditor.clearSelection(); }
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
        bar.classList.remove('cache-slide-in');
        void bar.offsetWidth;
        bar.classList.add('cache-slide-in');
    } catch { bar.classList.add('hidden'); }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    if (aceEditor) aceEditor.setValue('', -1);
    $('editorEmpty').classList.remove('hidden');
    $('editorContent').classList.add('hidden');
    $('cacheBar').classList.add('hidden');
    $('modelCount').classList.add('hidden');
    lastResult = null;
    setStatus('Cache cleared', 'info');
    log('action', 'Cache cleared');
    setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) { s.classList.add('status-exit'); s.addEventListener('animationend', () => { s.className = 'status'; s.classList.remove('status-exit'); }, { once: true }); } }, 2000);
}

// --- Tabs ---

function switchTab(tab) {
    $('tabFetch').classList.toggle('active', tab === 'fetch');
    $('tabPaste').classList.toggle('active', tab === 'paste');
    const entering = tab === 'fetch' ? $('fetchPanel') : $('pastePanel');
    const leaving  = tab === 'fetch' ? $('pastePanel') : $('fetchPanel');
    leaving.classList.add('hidden');
    leaving.classList.remove('crossfade-in');
    entering.classList.remove('hidden');
    entering.classList.remove('crossfade-in');
    void entering.offsetWidth;
    entering.classList.add('crossfade-in');
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
    const apiType = row.querySelector('.ep-apiType-wrap')?.dataset?.value || 'chat-completions';

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

        const { provider } = convertModels(raw, modelsUrl, name, key, apiType);
        return provider;

    } catch (e) {
        let msg = e.message || String(e);
        if (msg.includes('Failed to fetch')) msg += ' ï¿½ Server may be offline or CORS blocked';
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

    try {
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
            const rowId = parseInt(row.dataset.id);
            const provider = await fetchSingleEndpoint(rowId);
            if (provider) {
                allProviders.push(provider);
                totalModels += provider.models.length;
            }
        }

        if (allProviders.length === 0) {
            setStatus('All endpoints failed.', 'err');
            showToast('err', 'All endpoints failed');
            log('error', 'All endpoints failed');
        } else {
            showResult(allProviders, totalModels);
        }
    } catch (e) {
        setStatus('Fetch error: ' + e.message, 'err');
        showToast('err', e.message);
        log('error', 'Fetch failed: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined btn-icon">bolt</span> Fetch All & Merge';
    }
}

// --- Paste mode ---

function runPaste() {
    const rawText = $('pasteInput').value.trim();
    if (!rawText) { setStatus('Paste JSON response first.', 'err'); showToast('err', 'Paste JSON first'); log('error', 'No JSON pasted'); return; }

    let raw;
    try { raw = JSON.parse(rawText); } catch { setStatus('Invalid JSON.', 'err'); showToast('err', 'Invalid JSON'); log('error', 'Invalid JSON pasted'); return; }
    if (raw.object !== 'list') { setStatus('Invalid format: expected object="list".', 'err'); showToast('err', 'Expected object="list"'); log('error', 'Invalid format: expected object="list"'); return; }

    log('action', 'Converting pasted JSON');
    const modelsUrl = 'http://localhost:20128/v1';
    const { provider } = convertModels(raw, modelsUrl, $('pasteProviderName').value.trim(), $('pasteApiKey').value.trim());
    showResult([provider], provider.models.length);
}

// --- Download / Copy ---

function download() {
    const json = aceEditor ? aceEditor.getValue().trim() : (lastResult ? JSON.stringify(lastResult, null, '\t') : '');
    if (!json) { log('warn', 'Nothing to download'); return; }
    const dlBtn = document.querySelector('.scripts-dl-all-btn') || $('downloadBtn');
    if (dlBtn) animateIcon(dlBtn, 'icon-check');
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
    const json = aceEditor ? aceEditor.getValue().trim() : (lastResult ? JSON.stringify(lastResult, null, '\t') : '');
    if (!json) { log('warn', 'Nothing to copy'); return; }
    try {
        await navigator.clipboard.writeText(json);
        setStatus('Copied to clipboard!', 'info');
        log('success', 'Copied to clipboard');
        const copyBtn = document.querySelector('.scripts-dl-all-btn')?.previousElementSibling;
        if (copyBtn) animateIcon(copyBtn, 'icon-check');
        setTimeout(() => { const s = $('status'); if (s.classList.contains('info')) s.className = 'status'; }, 2000);
    } catch { setStatus('Copy failed.', 'err'); log('error', 'Copy failed'); showToast('err', 'Copy failed'); }
}

// --- Download scripts ---

const SCRIPT_MODES = [
    { key: 'fetch', icon: 'download', label: 'Fetch Only', desc: 'Fetches from /v1/models â†’ models_raw.json', files: { windows: 'fetch_models.bat', macos: 'fetch_models.sh', linux: 'fetch_models.sh', python: 'fetch_models.py' } },
    { key: 'convert', icon: 'code', label: 'Convert Only', desc: 'Converts models_raw.json â†’ chatLanguageModels.json', files: { windows: 'convert_models.bat', macos: 'convert_models.sh', linux: 'convert_models.sh', python: 'convert_models.py' } },
    { key: 'combined', icon: 'bolt', label: 'Combined', desc: 'Fetch + Convert in one step', files: { windows: 'fetch_and_convert.bat', macos: 'fetch_and_convert.sh', linux: 'fetch_and_convert.sh', python: 'fetch_and_convert.py' } },
];

const SCRIPT_PLATFORMS = [
    { key: 'windows', icon: 'desktop_windows', label: 'Windows', ext: '.bat' },
    { key: 'macos', icon: 'laptop_mac', label: 'macOS', ext: '.sh' },
    { key: 'linux', icon: 'terminal', label: 'Linux', ext: '.sh' },
    { key: 'python', icon: 'code', label: 'Python', ext: '.py' },
];

function detectOS() {
    const ua = navigator.userAgent || '';
    const pl = navigator.platform || '';
    if (/win/i.test(pl) || /Win/i.test(ua)) return 'windows';
    if (/mac/i.test(pl) || /Mac/i.test(ua)) return 'macos';
    return 'linux';
}

let scriptState = { osSelected: new Set([detectOS()]), selected: new Set(['combined']) };

function primaryOS() { return [...scriptState.osSelected][0] || detectOS(); }

function initScriptPanel() {
    const container = $('scriptsPanelInner');
    if (!container) return;
    const detected = SCRIPT_PLATFORMS.find(p => p.key === detectOS());

    const osItems = SCRIPT_PLATFORMS.map(p => {
        const active = scriptState.osSelected.has(p.key) ? ' active' : '';
        return `<div class="scripts-os-item${active}" data-os="${p.key}" onclick="toggleScriptOS('${p.key}')">
            <div class="scripts-mode-check"><span class="material-symbols-outlined">check</span></div>
            <div class="scripts-os-icon"><span class="material-symbols-outlined">${p.icon}</span></div>
            <div class="scripts-os-name">${p.label}</div>
            <div class="scripts-os-ext">${p.ext}</div>
        </div>`;
    }).join('');

    const pos = primaryOS();
    const modeItems = SCRIPT_MODES.map(m => {
        const active = scriptState.selected.has(m.key) ? ' active' : '';
        const file = m.files[pos];
        return `<div class="scripts-mode-item${active}" data-mode="${m.key}" onclick="toggleScriptMode('${m.key}')">
            <div class="scripts-mode-check"><span class="material-symbols-outlined">check</span></div>
            <div class="scripts-mode-icon"><span class="material-symbols-outlined">${m.icon}</span></div>
            <div class="scripts-mode-info">
                <div class="scripts-mode-name">${m.label}</div>
                <div class="scripts-mode-desc">${m.desc}</div>
            </div>
            <div class="scripts-mode-file" data-file="${m.key}">${file}</div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="scripts-os-section">
            <div class="scripts-os-header">
                <div class="scripts-os-label"><span class="material-symbols-outlined">settings_suggest</span> Operating System</div>
                <div class="scripts-os-detected"><span class="material-symbols-outlined">check_circle</span> Auto-detected: <strong>${detected ? detected.label : 'â€”'}</strong></div>
            </div>
            <div class="scripts-os-items">${osItems}</div>
            <div class="scripts-footer">
                <div class="scripts-select-all" onclick="toggleSelectAllOS()">
                    <span class="material-symbols-outlined" id="selectOsAllIcon">check_box</span>
                    Select all
                </div>
                <span class="scripts-os-count" id="osCount"></span>
            </div>
        </div>
        <div class="scripts-modes-section scripts-os-section">
            <div class="scripts-os-header">
                <div class="scripts-os-label"><span class="material-symbols-outlined">list</span> Script Mode</div>
            </div>
            ${modeItems}
            <div class="scripts-footer">
                <div class="scripts-select-all" onclick="toggleSelectAllModes()">
                    <span class="material-symbols-outlined" id="selectAllIcon">check_box</span>
                    Select all
                </div>
            </div>
        </div>
        <button type="button" class="scripts-dl-all-btn" id="scriptDlAllBtn" onclick="downloadSelectedScripts()" disabled>
            <span class="material-symbols-outlined">download</span>
            Download <span id="scriptDlCount">0</span>
        </button>`;
    updateScriptUI();
}

function toggleScriptOS(key) {
    if (scriptState.osSelected.has(key)) scriptState.osSelected.delete(key);
    else scriptState.osSelected.add(key);
    updateScriptUI();
}

function toggleSelectAllOS() {
    if (scriptState.osSelected.size === SCRIPT_PLATFORMS.length) scriptState.osSelected.clear();
    else SCRIPT_PLATFORMS.forEach(p => scriptState.osSelected.add(p.key));
    updateScriptUI();
}

function toggleScriptMode(key) {
    if (scriptState.selected.has(key)) scriptState.selected.delete(key);
    else scriptState.selected.add(key);
    updateScriptUI();
}

function toggleSelectAllModes() {
    if (scriptState.selected.size === SCRIPT_MODES.length) scriptState.selected.clear();
    else SCRIPT_MODES.forEach(m => scriptState.selected.add(m.key));
    updateScriptUI();
}

function updateScriptUI() {
    const pos = primaryOS();
    const osCount = scriptState.osSelected.size;
    const modeCount = scriptState.selected.size;

    // OS items
    document.querySelectorAll('.scripts-os-item').forEach(el => {
        el.classList.toggle('active', scriptState.osSelected.has(el.dataset.os));
    });
    const osAllIcon = $('selectOsAllIcon');
    if (osAllIcon) {
        osAllIcon.textContent = osCount === SCRIPT_PLATFORMS.length ? 'check_box' : osCount > 0 ? 'indeterminate_check_box' : 'check_box_outline_blank';
    }
    const osCnt = $('osCount');
    if (osCnt) osCnt.textContent = osCount > 1 ? osCount + ' selected' : '';

    // Mode items
    document.querySelectorAll('.scripts-mode-item').forEach(el => {
        el.classList.toggle('active', scriptState.selected.has(el.dataset.mode));
    });
    document.querySelectorAll('.scripts-mode-file').forEach(el => {
        const modeKey = el.dataset.file;
        const m = SCRIPT_MODES.find(x => x.key === modeKey);
        if (m) el.textContent = m.files[pos];
    });
    const modeAllIcon = $('selectAllIcon');
    if (modeAllIcon) {
        modeAllIcon.textContent = modeCount === SCRIPT_MODES.length ? 'check_box' : modeCount > 0 ? 'indeterminate_check_box' : 'check_box_outline_blank';
    }

    // Download button: total = osCount Ã— modeCount
    const total = osCount * modeCount;
    const btn = $('scriptDlAllBtn');
    const cnt = $('scriptDlCount');
    if (btn) btn.disabled = total === 0;
    if (cnt) cnt.textContent = total;
}

function downloadSelectedScripts() {
    const files = [];
    SCRIPT_MODES.filter(m => scriptState.selected.has(m.key)).forEach(m => {
        scriptState.osSelected.forEach(os => { files.push(m.files[os]); });
    });
    if (!files.length) return;
    files.forEach((file, i) => { setTimeout(() => downloadScript(file), i * 150); });
}

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

function initDocsPanel() {
    const el = $('docsContent');
    if (!el) return;
    el.innerHTML = `
<div class="docs-section">
<h2><span class="material-symbols-outlined">menu_book</span> What It Does</h2>
<p>VSCode Modelator fetches model lists from any OpenAI-compatible <code>/v1/models</code> endpoint and converts them into <code>chatLanguageModels.json</code> &#8212; the file VS Code reads to populate the Copilot Chat model picker.</p>
<p>Single-file browser app. No server, no install, no analytics. The JSON output is the product.</p>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">bolt</span> How To Use It</h2>
<ol>
<li><strong>Add an endpoint.</strong> In <span class="docs-kbd">Form</span>, paste the API base URL and authentication key. The URL should resolve to a <code>/v1/models</code> endpoint or its root.</li>
<li><strong>Fetch.</strong> Click <span class="docs-kbd">Fetch All &amp; Merge</span>. Each endpoint is queried, responses normalized, and results merged into one list.</li>
<li><strong>Inspect.</strong> Switch to <span class="docs-kbd">Editor</span>. Toggle between Tree and Code view. Edit mode enables direct modification of the JSON.</li>
<li><strong>Save.</strong> Click <span class="docs-kbd">Download</span>. Place the file in your VS Code user directory (see paths below), restart VS Code.</li>
</ol>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">route</span> When Direct Fetch Fails</h2>
<p>Firewalls, localhost-only networks, and CORS policies can block browser requests. Use the offline path:</p>
<ol>
<li>Open <span class="docs-kbd">Scripts</span></li>
<li>Pick your OS and a mode (curl, Python, or PowerShell)</li>
<li>Run the downloaded script on a machine with API access</li>
<li>Copy the output JSON into the <span class="docs-kbd">Paste JSON</span> tab in the Editor panel</li>
</ol>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">keyboard</span> Keyboard Shortcuts</h2>
<table class="docs-table">
<thead><tr><th>Key</th><th>Action</th></tr></thead>
<tbody>
<tr><td><span class="docs-kbd">Ctrl + E</span></td><td>Toggle edit mode</td></tr>
<tr><td><span class="docs-kbd">Ctrl + F</span></td><td>Open Find &amp; Replace</td></tr>
<tr><td><span class="docs-kbd">Shift + Alt + F</span></td><td>Format / pretty-print JSON</td></tr>
<tr><td><span class="docs-kbd">Escape</span></td><td>Close Find bar</td></tr>
</tbody>
</table>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">settings</span> Response Formats</h2>
<p>The converter normalizes these shapes automatically:</p>
<ul>
<li><strong>OpenAI standard</strong> &#8212; <code>{"object":"list","data":[...]}</code></li>
<li><strong>Capabilities envelope</strong> &#8212; <code>{"id":"model","capabilities":{...}}</code></li>
<li><strong>Flat array</strong> &#8212; <code>[{"id":"model1"},...]</code></li>
<li><strong>Vercel AI SDK</strong> &#8212; <code>{"models":[...]}</code></li>
</ul>
<p>Unrecognized formats still render in the editor &#8212; inspect and fix manually.</p>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">folder</span> File Placement</h2>
<table class="docs-table">
<thead><tr><th>OS</th><th>Path</th></tr></thead>
<tbody>
<tr><td>Windows</td><td><code>%APPDATA%\Code\User\</code></td></tr>
<tr><td>macOS</td><td><code>~/Library/Application Support/Code/User/</code></td></tr>
<tr><td>Linux</td><td><code>~/.config/Code/User/</code></td></tr>
</tbody>
</table>
<p>Restart VS Code after placing the file.</p>
</div>`;
}

function initAboutPanel() {
    const el = $('aboutContent');
    if (!el) return;
    el.innerHTML = `
<div class="docs-section">
<h2><span class="material-symbols-outlined">info</span> What This Is</h2>
<p>VSCode Modelator is a browser-based tool that generates <code>chatLanguageModels.json</code> &#8212; the configuration file VS Code uses to register custom model providers in Copilot Chat.</p>
<p>It was built because maintaining that JSON by hand across multiple API providers is error-prone and tedious.</p>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">code</span> How It Works</h2>
<p>Each configured endpoint receives a GET request to its <code>/v1/models</code> path. The response is parsed, model entries normalized into a consistent schema, and results from all endpoints merged into a single file.</p>
<p>All processing happens in the browser. No data is transmitted except the API requests you explicitly configure.</p>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">build</span> Under The Hood</h2>
<table class="docs-table">
<thead><tr><th>Layer</th><th>Implementation</th></tr></thead>
<tbody>
<tr><td>Editor</td><td>Ace.js 1.32.7 with tree view overlay</td></tr>
<tr><td>Fonts</td><td>Inter + JetBrains Mono via Google Fonts</td></tr>
<tr><td>Icons</td><td>Google Material Symbols Outlined</td></tr>
<tr><td>Architecture</td><td>Single HTML file, vanilla CSS and JavaScript, zero build step</td></tr>
<tr><td>Theme</td><td>Dark / light toggle, persisted in localStorage</td></tr>
<tr><td>Storage</td><td>Endpoint configs and preview cache in localStorage</td></tr>
</tbody>
</table>
</div>

<div class="docs-section">
<h2><span class="material-symbols-outlined">gavel</span> License</h2>
<p>Public domain. Use it, fork it, modify it, ship it in a product. No warranty, no attribution required. If it breaks your model picker, the fix is in <code>index.html</code> &#8212; it is ~250 lines of HTML.</p>
</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    log('info', 'VSCode Modelator initialized');

    // Init docs panel
    initDocsPanel();

    // Init about panel
    initAboutPanel();

    // Load endpoints
    loadEndpoints();

    // Init Ace editor
    initAce();

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

    // Init scripts panel
    initScriptPanel();

    // Find bar keyboard handlers
    const findInput = $('findInput');
    const replaceInput = $('replaceInput');
    if (findInput) {
        findInput.addEventListener('input', () => doFind());
        findInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }
            if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
        });
    }
    if (replaceInput) {
        replaceInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); replaceOne(); }
            if (e.key === 'Escape') { e.preventDefault(); closeFindBar(); }
        });
    }
});
