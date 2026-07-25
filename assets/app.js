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
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    if (currentView === 'tree') { log('warn', 'Switch to Code view first to edit'); return; }
    editMode = !editMode;
    const wrap = $('editorCodeWrap');
    const highlight = $('editorHighlight');
    const textarea = $('preview');
    const icon = $('editModeIcon');
    const label = $('editModeLabel');
    const btn = $('editBtn');
    if (editMode) {
        // Overlay: show highlight as colored background, textarea transparent on top
        const json = highlight.textContent || '';
        textarea.value = json;
        renderHighlight(json); // keep highlight colored behind
        highlight.classList.remove('hidden');
        textarea.classList.remove('hidden');
        wrap.classList.add('editing');
        icon.textContent = 'visibility';
        label.textContent = 'View';
        btn.classList.add('active');
        textarea.focus();
        updateLineNumbers(json);
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
        wrap.classList.remove('editing');
        highlight.classList.remove('hidden');
        textarea.classList.add('hidden');
        icon.textContent = 'edit';
        label.textContent = 'Edit';
        btn.classList.remove('active');
        closeAutocomplete();
        log('action', 'Edit mode disabled');
    }
}

// --- Beautify / Format ---

function beautifyJSON() {
    const textarea = $('preview');
    const highlight = $('highlightCode');
    const text = editMode ? textarea.value : highlight.textContent;
    if (!text || !text.trim()) { log('warn', 'Nothing to format'); return; }
    try {
        const parsed = JSON.parse(text);
        const formatted = JSON.stringify(parsed, null, '\t');
        if (editMode) {
            textarea.value = formatted;
            textarea.setSelectionRange(0, 0);
            textarea.scrollTop = 0;
        }
        renderHighlight(formatted);
        updateLineNumbers(formatted);
        saveCache(formatted);
        lastResult = parsed;
        log('success', `JSON formatted (${formatted.length} chars, ${formatted.split('\\n').length} lines)`);
    } catch (e) {
        log('error', `Format failed: ${e.message}`);
    }
}

// --- Autocomplete ---

const AC_SCHEMA_KEYS = [
    { key: 'name', type: 'string', snippet: '"name": "${1:name}"' },
    { key: 'vendor', type: 'string', snippet: '"vendor": "customendpoint"' },
    { key: 'apiKey', type: 'string', snippet: '"apiKey": "${1:sk-xxxx}"' },
    { key: 'apiType', type: 'string', snippet: '"apiType": "chat-completions"' },
    { key: 'models', type: 'array', snippet: '"models": [\n\t${1}\n]' },
    { key: 'id', type: 'string', snippet: '"id": "${1:model-id}"' },
    { key: 'url', type: 'string', snippet: '"url": "${1:http://localhost:20128/v1}"' },
    { key: 'toolCalling', type: 'boolean', snippet: '"toolCalling": true' },
    { key: 'vision', type: 'boolean', snippet: '"vision": true' },
    { key: 'maxInputTokens', type: 'number', snippet: '"maxInputTokens": 128000' },
    { key: 'maxOutputTokens', type: 'number', snippet: '"maxOutputTokens": 64000' },
    { key: 'owned_by', type: 'string', snippet: '"owned_by": "${1:combo}"' },
    { key: 'object', type: 'string', snippet: '"object": "list"' },
    { key: 'data', type: 'array', snippet: '"data": [\n\t${1}\n]' },
    { key: 'true', type: 'boolean', snippet: 'true' },
    { key: 'false', type: 'boolean', snippet: 'false' },
    { key: 'null', type: 'null', snippet: 'null' },
];

let acState = { active: false, items: [], selectedIdx: 0, prefix: '', startPos: 0, type: '' };

function getCursorInfo(textarea) {
    const pos = textarea.selectionStart;
    const text = textarea.value;
    // Find the word being typed (after a quote or at start)
    let start = pos;
    while (start > 0 && /[\w-]/.test(text[start - 1])) start--;
    const word = text.substring(start, pos);
    // Determine context: are we inside a key (after " and before ":) or a value?
    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const lineText = text.substring(lineStart, pos);
    const beforeCursor = text.substring(0, pos);
    // Count unclosed quotes before cursor
    let inString = false;
    for (let i = 0; i < pos; i++) { if (text[i] === '"' && (i === 0 || text[i-1] !== '\\')) inString = !inString; }
    // Check if this looks like a key position (after { or , and whitespace/newline, inside quotes)
    const trimmed = lineText.trimStart();
    const isKey = inString && (trimmed.startsWith('"') && !trimmed.includes(':'));
    return { pos, start, word, inString, isKey, beforeCursor };
}

function triggerAutocomplete() {
    if (!editMode) return;
    const textarea = $('preview');
    const info = getCursorInfo(textarea);
    let items = [];
    const query = info.word.toLowerCase();

    if (info.inString && info.word.length > 0) {
        // Filter schema keys
        items = AC_SCHEMA_KEYS.filter(s =>
            s.key.toLowerCase().startsWith(query)
        ).map(s => ({
            label: s.key,
            type: s.type,
            icon: s.type === 'boolean' || s.type === 'null' ? 'val' : (s.type === 'array' ? 'snippet' : 'key'),
            snippet: s.snippet,
            replaceStart: info.start,
            replaceEnd: info.pos,
        }));
        acState.type = 'key';
    }

    if (items.length === 0) {
        closeAutocomplete();
        return;
    }

    acState.active = true;
    acState.items = items;
    acState.selectedIdx = 0;
    acState.startPos = info.start;
    acState.endPos = info.pos;
    renderAutocomplete(textarea);
}

function renderAutocomplete(textarea) {
    const dd = $('autocompleteDropdown');
    if (acState.items.length === 0) { closeAutocomplete(); return; }

    // Position near cursor using mirror technique
    const rect = textarea.getBoundingClientRect();
    const mirror = document.createElement('div');
    mirror.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:' + getComputedStyle(textarea).fontFamily + ';font-size:' + getComputedStyle(textarea).fontSize + ';line-height:' + getComputedStyle(textarea).lineHeight + ';padding:' + getComputedStyle(textarea).padding;
    mirror.textContent = textarea.value.substring(0, textarea.selectionStart);
    const span = document.createElement('span');
    span.textContent = '|';
    mirror.appendChild(span);
    document.body.appendChild(mirror);
    const spanRect = span.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const caretY = spanRect.top - mirrorRect.top;
    const caretX = spanRect.left - mirrorRect.left;
    document.body.removeChild(mirror);

    // Calculate position relative to textarea
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop);
    const paddingLeft = parseFloat(getComputedStyle(textarea).paddingLeft);
    const scrollTop = textarea.scrollTop;
    const scrollLeft = textarea.scrollLeft;

    let top = rect.top + paddingTop + caretY - scrollTop + lineHeight + 2;
    let left = rect.left + paddingLeft + caretX - scrollLeft;

    // Clamp to viewport
    const ddMaxH = 200;
    if (top + ddMaxH > window.innerHeight) top = rect.top + paddingTop + caretY - scrollTop - ddMaxH - 2;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
    if (left < rect.left) left = rect.left;

    dd.style.top = top + 'px';
    dd.style.left = left + 'px';

    let html = '';
    acState.items.forEach((item, i) => {
        const sel = i === acState.selectedIdx ? ' selected' : '';
        const iconCls = 'ac-icon ac-icon-' + item.icon;
        const iconChar = item.icon === 'val' ? 'T' : (item.icon === 'snippet' ? '»' : 'K');
        html += `<div class="autocomplete-item${sel}" data-idx="${i}" onmousedown="acceptAutocomplete(${i})">`;
        html += `<span class="${iconCls}">${iconChar}</span>`;
        html += `<span class="ac-label">${escHtml(item.label)}</span>`;
        html += `<span class="ac-type">${escHtml(item.type)}</span>`;
        html += `</div>`;
    });
    dd.innerHTML = html;
    dd.classList.remove('hidden');
}

function closeAutocomplete() {
    acState.active = false;
    acState.items = [];
    const dd = $('autocompleteDropdown');
    if (dd) dd.classList.add('hidden');
}

function acceptAutocomplete(idx) {
    const item = acState.items[idx];
    if (!item) return;
    const textarea = $('preview');
    const start = acState.startPos;
    const end = textarea.selectionStart;
    // Replace the current word with the snippet
    const snippet = item.snippet;
    // Handle simple snippets (no tab stops)
    const plain = snippet.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d+/g, '');
    textarea.setRangeText(plain, start, end, 'end');
    textarea.focus();
    closeAutocomplete();
    // Auto-format after insert if it's a structure
    if (item.type === 'array' || item.type === 'boolean' || item.type === 'null') {
        // Trigger re-save
        saveCache(textarea.value);
    }
}

function navigateAutocomplete(dir) {
    if (!acState.active) return false;
    acState.selectedIdx = (acState.selectedIdx + dir + acState.items.length) % acState.items.length;
    renderAutocomplete($('preview'));
    return true;
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

// --- View switching ---

let treeExpanded = {}; // key => boolean (open/closed)

function switchView(view) {
    currentView = view;
    $('btnViewJson').classList.toggle('active', view === 'json');
    $('btnViewTree').classList.toggle('active', view === 'tree');

    if (view === 'json') {
        $('editorCodeWrap').classList.remove('hidden');
        $('treeView').classList.add('hidden');
        $('lineNumbers').style.display = '';
        $('codeControls').classList.remove('hidden');
        // Update JSON view if data exists
        if (lastResult) {
            const json = JSON.stringify(lastResult, null, '\t');
            renderHighlight(json);
            updateLineNumbers(json);
            $('editorHighlight').classList.remove('hidden');
        }
        // Disable edit in tree
        editMode = false;
        $('editorCodeWrap').classList.remove('editing');
        $('editorHighlight').classList.remove('hidden');
        $('preview').classList.add('hidden');
        $('editModeIcon').textContent = 'edit';
        $('editModeLabel').textContent = 'Edit';
        $('editBtn').classList.remove('active');
    } else {
        $('editorCodeWrap').classList.add('hidden');
        $('treeView').classList.remove('hidden');
        $('codeControls').classList.add('hidden');
        if (lastResult) renderTreeView(lastResult);
        // Close edit mode & find
        editMode = false;
        closeFindBar();
    }
    log('action', `View: ${view}`);
}

// --- Tree view rendering ---

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

let findState = { open: false, regex: false, caseSensitive: false, matches: [], currentIdx: -1 };

function toggleFindBar() {
    if (currentView !== 'json') { log('warn', 'Find is available in Code view only'); return; }
    findState.open ? closeFindBar() : openFindBar();
}

function openFindBar() {
    findState.open = true;
    $('findBar').classList.remove('hidden');
    const ta = $('preview');
    // Pre-fill with selected text
    if (editMode && ta.selectionStart !== ta.selectionEnd) {
        $('findInput').value = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    } else {
        $('findInput').select();
    }
    $('findInput').focus();
    runFind();
    log('action', 'Find bar opened');
}

function closeFindBar() {
    findState.open = false;
    findState.matches = [];
    findState.currentIdx = -1;
    $('findBar').classList.add('hidden');
    clearFindHighlights();
    log('action', 'Find bar closed');
}

function toggleFindOption(opt) {
    if (opt === 'regex') {
        findState.regex = !findState.regex;
        $('findRegexBtn').classList.toggle('active', findState.regex);
    } else if (opt === 'case') {
        findState.caseSensitive = !findState.caseSensitive;
        $('findCaseBtn').classList.toggle('active', findState.caseSensitive);
    }
    runFind();
}

function getFindRegex() {
    const query = $('findInput').value;
    if (!query) return null;
    try {
        const flags = findState.caseSensitive ? 'g' : 'gi';
        return findState.regex ? new RegExp(query, flags) : new RegExp(escapeRegex(query), flags);
    } catch { return null; }
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function runFind() {
    clearFindHighlights();
    findState.matches = [];
    findState.currentIdx = -1;
    const countEl = $('findCount');
    const regex = getFindRegex();
    if (!regex) { countEl.textContent = ''; return; }

    const text = editMode ? $('preview').value : ($('highlightCode').textContent || '');
    let m;
    while ((m = regex.exec(text)) !== null) {
        findState.matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        if (findState.matches.length > 10000) break; // safety
    }

    if (findState.matches.length === 0) {
        countEl.textContent = 'No results';
        return;
    }
    findState.currentIdx = 0;
    updateFindCount();
    highlightFindMatches();
    scrollToMatch(0);
}

function updateFindCount() {
    const total = findState.matches.length;
    const cur = findState.currentIdx >= 0 ? findState.currentIdx + 1 : 0;
    $('findCount').textContent = total > 0 ? `${cur} / ${total}` : 'No results';
}

function findNext() {
    if (findState.matches.length === 0) return;
    findState.currentIdx = (findState.currentIdx + 1) % findState.matches.length;
    updateFindCount();
    highlightFindMatches();
    scrollToMatch(findState.currentIdx);
}

function findPrev() {
    if (findState.matches.length === 0) return;
    findState.currentIdx = (findState.currentIdx - 1 + findState.matches.length) % findState.matches.length;
    updateFindCount();
    highlightFindMatches();
    scrollToMatch(findState.currentIdx);
}

function clearFindHighlights() {
    if (editMode) {
        // For textarea, remove any temp highlight spans
        const ta = $('preview');
        ta.style.backgroundImage = '';
    } else {
        // Re-render highlight to clear marks
        if (lastResult) {
            const json = JSON.stringify(lastResult, null, '\t');
            renderHighlight(json);
        }
    }
}

function highlightFindMatches() {
    if (editMode) return; // textarea highlighting handled by scroll-to-match
    // In read-only mode, we highlight by re-rendering with marks
    const text = $('highlightCode').textContent;
    if (!text || findState.matches.length === 0) return;

    let html = '';
    let lastIdx = 0;
    const sorted = [...findState.matches].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i];
        if (m.start < lastIdx) continue; // skip overlapping
        html += escHtml(text.substring(lastIdx, m.start));
        const cls = i === findState.currentIdx ? 'find-match-current' : 'find-match';
        html += `<mark class="${cls}">${escHtml(text.substring(m.start, m.end))}</mark>`;
        lastIdx = m.end;
    }
    html += escHtml(text.substring(lastIdx));
    $('highlightCode').innerHTML = html;
}

function scrollToMatch(idx) {
    if (idx < 0 || idx >= findState.matches.length) return;
    if (editMode) {
        const ta = $('preview');
        const m = findState.matches[idx];
        ta.focus();
        ta.setSelectionRange(m.start, m.end);
        // Scroll into view
        const linesBefore = ta.value.substring(0, m.start).split('\n').length;
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight);
        ta.scrollTop = Math.max(0, (linesBefore - 5) * lineHeight);
    } else {
        // Scroll to highlighted mark in pre
        const mark = $('highlightCode').querySelector('.find-match-current');
        if (mark) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

function findReplaceOne() {
    if (!editMode || findState.matches.length === 0) return;
    const ta = $('preview');
    const m = findState.matches[findState.currentIdx];
    if (!m) return;
    const replacement = $('findReplaceInput').value;
    ta.setRangeText(replacement, m.start, m.end, 'select');
    log('action', `Replaced: "${m.text}" → "${replacement}"`);
    // Rebuild text and re-find
    saveCache(ta.value);
    runFind();
}

function findReplaceAll() {
    if (!editMode || findState.matches.length === 0) return;
    const ta = $('preview');
    const regex = getFindRegex();
    if (!regex) return;
    const replacement = $('findReplaceInput').value;
    const count = findState.matches.length;
    ta.value = ta.value.replace(regex, replacement);
    log('action', `Replaced ${count} occurrence(s)`);
    saveCache(ta.value);
    runFind();
}

// --- Keyboard shortcuts ---

document.addEventListener('keydown', e => {
    const ta = $('preview');
    const isTextarea = document.activeElement === ta;

    // Autocomplete navigation (up/down/enter/escape)
    if (acState.active && isTextarea) {
        if (e.key === 'ArrowDown') { e.preventDefault(); navigateAutocomplete(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); navigateAutocomplete(-1); return; }
        if (e.key === 'Enter' && acState.items.length > 0) { e.preventDefault(); acceptAutocomplete(acState.selectedIdx); return; }
        if (e.key === 'Tab' && acState.items.length > 0) { e.preventDefault(); acceptAutocomplete(acState.selectedIdx); return; }
        if (e.key === 'Escape') { e.preventDefault(); closeAutocomplete(); return; }
    }

    // Ctrl+F / Cmd+F — open find
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        if (currentView === 'json' && !$('editorContent').classList.contains('hidden')) {
            e.preventDefault();
            openFindBar();
        }
    }
    // Ctrl+E / Cmd+E — toggle edit
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        if (currentView === 'json' && !$('editorContent').classList.contains('hidden')) {
            e.preventDefault();
            toggleEditMode();
        }
    }
    // Shift+Alt+F — beautify
    if (e.shiftKey && e.altKey && e.key === 'F') {
        if (currentView === 'json' && !$('editorContent').classList.contains('hidden')) {
            e.preventDefault();
            beautifyJSON();
        }
    }
    // Escape — close find bar or autocomplete
    if (e.key === 'Escape') {
        if (findState.open) { e.preventDefault(); closeFindBar(); }
        else if (acState.active) { e.preventDefault(); closeAutocomplete(); }
    }
    // Enter in find input — next
    if (e.key === 'Enter' && document.activeElement === $('findInput')) {
        e.preventDefault();
        if (e.shiftKey) findPrev(); else findNext();
    }
    // Enter in replace input — replace one
    if (e.key === 'Enter' && document.activeElement === $('findReplaceInput')) {
        e.preventDefault();
        findReplaceOne();
    }
    // Tab in textarea — insert tab (2 spaces)
    if (e.key === 'Tab' && isTextarea && !acState.active) {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.setRangeText('  ', start, end, 'end');
        saveCache(ta.value);
    }
});

// --- Textarea input handler for autocomplete ---

document.addEventListener('DOMContentLoaded', () => {
    const ta = $('preview');
    if (ta) {
        ta.addEventListener('input', () => {
            if (!editMode) return;
            const info = getCursorInfo(ta);
            if (info.inString && info.word.length >= 1) {
                triggerAutocomplete();
            } else {
                closeAutocomplete();
            }
            // Live update line numbers
            updateLineNumbers(ta.value);
        });
        ta.addEventListener('blur', () => {
            // Delay to allow autocomplete click
            setTimeout(closeAutocomplete, 200);
        });
    }
});

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
    if (currentView === 'tree') {
        renderTreeView(data);
    } else {
        renderHighlight(json);
        updateLineNumbers(json);
    }
    $('preview').value = json;
    editMode = false;
    $('editorHighlight').classList.add('hidden');
    $('preview').classList.add('hidden');
    if (currentView === 'json') $('editorHighlight').classList.remove('hidden');
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
        switchView(currentView);
        $('preview').value = cached;
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
        if (msg.includes('Failed to fetch')) msg += ' � Server may be offline or CORS blocked';
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
        const val = preview.value || '';
        const lines = val.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) html += '<span>' + i + '</span>';
        $('lineNumbers').innerHTML = html;
        if (editMode) {
            renderHighlight(val);
        }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            const trimmed = val.trim();
            if (trimmed) {
                try { JSON.parse(trimmed); saveCache(trimmed); lastResult = JSON.parse(trimmed); } catch {}
            }
        }, 500);
    });

    // Scroll sync: textarea → highlight + line-numbers (edit mode)
    preview.addEventListener('scroll', () => {
        if (!editMode) return;
        const h = $('editorHighlight');
        const ln = $('lineNumbers');
        h.scrollTop = preview.scrollTop;
        h.scrollLeft = preview.scrollLeft;
        if (ln) ln.scrollTop = preview.scrollTop;
    });

    // Enter key triggers fetch
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !$('fetchBtn').disabled
            && !$('fetchPanel').classList.contains('hidden')) runFetchAll();
    });

    // Find input live search
    $('findInput').addEventListener('input', runFind);

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
