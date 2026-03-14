/**
 * Dashboard Frontend
 *
 * Returns the full HTML/CSS/JS for the web dashboard as a string.
 * Single-file, no build step, no dependencies — just inline everything.
 */

export function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Automaton Dashboard</title>
<style>
  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: #30363d;
    --text: #c9d1d9;
    --text2: #8b949e;
    --accent: #8b80ff;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --blue: #58a6ff;
    --cyan: #39d2c0;
    --font: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    line-height: 1.5;
  }

  /* ─── Layout ────────────────── */

  .header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header h1 {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent);
  }

  .header .agent-name {
    color: var(--text2);
    font-size: 13px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .status-badge .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-running { background: rgba(63,185,80,0.15); color: var(--green); }
  .status-running .dot { background: var(--green); animation: pulse 2s infinite; }
  .status-stopped { background: rgba(139,148,158,0.15); color: var(--text2); }
  .status-stopped .dot { background: var(--text2); }
  .status-starting { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .status-starting .dot { background: var(--yellow); animation: pulse 1s infinite; }
  .status-stopping { background: rgba(248,81,73,0.15); color: var(--red); }
  .status-stopping .dot { background: var(--red); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .controls {
    display: flex;
    gap: 8px;
  }

  .btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg3);
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:hover { background: var(--border); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-start { border-color: var(--green); color: var(--green); }
  .btn-start:hover { background: rgba(63,185,80,0.15); }
  .btn-stop { border-color: var(--red); color: var(--red); }
  .btn-stop:hover { background: rgba(248,81,73,0.15); }
  .btn-restart { border-color: var(--yellow); color: var(--yellow); }
  .btn-restart:hover { background: rgba(210,153,34,0.15); }

  /* ─── Tabs ──────────────────── */

  .tabs {
    display: flex;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 0 24px;
    gap: 0;
    overflow-x: auto;
  }

  .tab {
    padding: 10px 18px;
    cursor: pointer;
    color: var(--text2);
    font-size: 12px;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  /* ─── Panels ────────────────── */

  .panel { display: none; padding: 16px 24px; }
  .panel.active { display: block; }

  /* ─── Logs ──────────────────── */

  .log-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .log-controls input {
    padding: 6px 12px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    width: 260px;
  }

  .log-controls label {
    font-size: 11px;
    color: var(--text2);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .log-controls input[type="checkbox"] { width: auto; }

  #logContainer {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    height: calc(100vh - 230px);
    overflow-y: auto;
    font-size: 12px;
    line-height: 1.7;
  }

  .log-line {
    padding: 1px 8px;
    border-radius: 3px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .log-line:hover { background: var(--bg3); }

  .log-time { color: var(--text2); }
  .log-module { color: var(--text2); display: inline-block; min-width: 110px; }

  .log-level-debug { color: var(--text2); }
  .log-level-info { color: var(--text); }
  .log-level-warn { color: var(--yellow); }
  .log-level-error { color: var(--red); }
  .log-level-fatal { color: var(--red); font-weight: bold; }

  /* ─── Cards ─────────────────── */

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .card-label {
    font-size: 11px;
    color: var(--text2);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .card-value {
    font-size: 22px;
    font-weight: 600;
    color: var(--text);
  }

  .card-sub {
    font-size: 11px;
    color: var(--text2);
    margin-top: 4px;
  }

  /* ─── Tables ────────────────── */

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .data-table th {
    text-align: left;
    padding: 8px 12px;
    background: var(--bg3);
    color: var(--text2);
    font-weight: 500;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border);
  }

  .data-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .data-table tr:hover td { background: var(--bg3); }

  .tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .tag-active { background: rgba(63,185,80,0.15); color: var(--green); }
  .tag-completed { background: rgba(88,166,255,0.15); color: var(--blue); }
  .tag-failed { background: rgba(248,81,73,0.15); color: var(--red); }
  .tag-pending { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .tag-running { background: rgba(131,127,255,0.15); color: var(--accent); }
  .tag-paused { background: rgba(139,148,158,0.15); color: var(--text2); }
  .tag-blocked { background: rgba(248,81,73,0.15); color: var(--red); }
  .tag-assigned { background: rgba(57,210,192,0.15); color: var(--cyan); }

  /* ─── Soul/Config ───────────── */

  .markdown-content {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    white-space: pre-wrap;
    line-height: 1.8;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    margin: 20px 0 12px;
  }

  .section-title:first-child { margin-top: 0; }

  /* ─── Responsive ────────────── */

  @media (max-width: 768px) {
    .header { padding: 10px 16px; flex-wrap: wrap; gap: 8px; }
    .panel { padding: 12px 16px; }
    .tabs { padding: 0 16px; }
    .card-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>🤖 Automaton</h1>
    <span class="agent-name" id="agentName">—</span>
    <span class="status-badge status-stopped" id="statusBadge">
      <span class="dot"></span>
      <span id="statusText">stopped</span>
    </span>
  </div>
  <div class="controls">
    <button class="btn btn-start" id="btnStart" onclick="apiAction('start')">▶ Start</button>
    <button class="btn btn-stop" id="btnStop" onclick="apiAction('stop')">■ Stop</button>
    <button class="btn btn-restart" id="btnRestart" onclick="apiAction('restart')">↻ Restart</button>
  </div>
</div>

<div class="tabs">
  <div class="tab active" data-tab="logs">Logs</div>
  <div class="tab" data-tab="overview">Overview</div>
  <div class="tab" data-tab="goals">Goals & Tasks</div>
  <div class="tab" data-tab="events">Events</div>
  <div class="tab" data-tab="turns">Turns</div>
  <div class="tab" data-tab="heartbeat">Heartbeat</div>
  <div class="tab" data-tab="knowledge">Knowledge</div>
  <div class="tab" data-tab="soul">Soul</div>
  <div class="tab" data-tab="config">Config</div>
</div>

<!-- ─── Logs Panel ──────────────────── -->
<div class="panel active" id="panel-logs">
  <div class="log-controls">
    <input type="text" id="logFilter" placeholder="Filter logs..." oninput="filterLogs()">
    <label><input type="checkbox" id="autoScroll" checked> Auto-scroll</label>
    <label><input type="checkbox" id="showDebug"> Debug</label>
    <button class="btn" onclick="clearLogs()">Clear</button>
    <span style="color:var(--text2);font-size:11px" id="logCount">0 entries</span>
  </div>
  <div id="logContainer"></div>
</div>

<!-- ─── Overview Panel ──────────────── -->
<div class="panel" id="panel-overview">
  <div class="card-grid" id="overviewCards"></div>
  <div class="section-title">Recent Turns</div>
  <table class="data-table" id="recentTurnsTable">
    <thead><tr><th>ID</th><th>Tools</th><th>Tokens</th><th>Time</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<!-- ─── Goals Panel ─────────────────── -->
<div class="panel" id="panel-goals">
  <div class="section-title">Active Goals</div>
  <table class="data-table" id="goalsTable">
    <thead><tr><th>Title</th><th>Status</th><th>Revenue</th><th>Created</th></tr></thead>
    <tbody></tbody>
  </table>
  <div class="section-title" style="margin-top:24px">Ready Tasks</div>
  <table class="data-table" id="tasksTable">
    <thead><tr><th>Title</th><th>Goal</th><th>Status</th><th>Priority</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<!-- ─── Events Panel ────────────────── -->
<div class="panel" id="panel-events">
  <div class="log-controls" style="margin-bottom:12px">
    <input type="text" id="eventFilter" placeholder="Filter events...">
    <button class="btn" onclick="loadEvents()">Refresh</button>
  </div>
  <table class="data-table" id="eventsTable">
    <thead><tr><th>Type</th><th>Content</th><th>Tokens</th><th>Time</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<!-- ─── Turns Panel ─────────────────── -->
<div class="panel" id="panel-turns">
  <button class="btn" onclick="loadTurns()" style="margin-bottom:12px">Refresh</button>
  <table class="data-table" id="turnsTable">
    <thead><tr><th>ID</th><th>State</th><th>Tools</th><th>Tokens</th><th>Cost ¢</th><th>Time</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<!-- ─── Heartbeat Panel ─────────────── -->
<div class="panel" id="panel-heartbeat">
  <div class="section-title">Scheduled Tasks</div>
  <table class="data-table" id="heartbeatTable">
    <thead><tr><th>Task</th><th>Schedule</th><th>Enabled</th><th>Last Run</th><th>Next Run</th></tr></thead>
    <tbody></tbody>
  </table>
  <div class="section-title" style="margin-top:24px">Recent History</div>
  <table class="data-table" id="heartbeatHistoryTable">
    <thead><tr><th>Task</th><th>Status</th><th>Duration</th><th>Time</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<!-- ─── Knowledge Panel ─────────────── -->
<div class="panel" id="panel-knowledge">
  <div class="log-controls" style="margin-bottom:12px">
    <input type="text" id="knowledgeSearch" placeholder="Search knowledge...">
    <button class="btn" onclick="loadKnowledge()">Search</button>
  </div>
  <table class="data-table" id="knowledgeTable">
    <thead><tr><th>Category</th><th>Key</th><th>Content</th><th>Confidence</th></tr></thead>
    <tbody></tbody>
  </table>
</div>

<!-- ─── Soul Panel ──────────────────── -->
<div class="panel" id="panel-soul">
  <button class="btn" onclick="loadSoul()" style="margin-bottom:12px">Refresh</button>
  <div class="markdown-content" id="soulContent">Loading...</div>
</div>

<!-- ─── Config Panel ────────────────── -->
<div class="panel" id="panel-config">
  <button class="btn" onclick="loadConfig()" style="margin-bottom:12px">Refresh</button>
  <div class="markdown-content" id="configContent">Loading...</div>
</div>

<script>
// ─── State ────────────────────────────

let logs = [];
let ws = null;
let reconnectTimer = null;

// ─── WebSocket ────────────────────────

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'log') {
      addLog(msg.data);
    } else if (msg.type === 'status') {
      updateProcessStatus(msg.data);
    }
  };

  ws.onclose = () => {
    reconnectTimer = setTimeout(connectWs, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

connectWs();

// ─── Logs ─────────────────────────────

function addLog(entry) {
  logs.push(entry);
  if (logs.length > 5000) logs = logs.slice(-4000);
  renderLogEntry(entry);
  document.getElementById('logCount').textContent = logs.length + ' entries';
}

function renderLogEntry(entry) {
  const container = document.getElementById('logContainer');
  const showDebug = document.getElementById('showDebug').checked;
  const filter = document.getElementById('logFilter').value.toLowerCase();

  if (entry.level === 'debug' && !showDebug) return;
  if (filter && !entry.message.toLowerCase().includes(filter) && !entry.module.toLowerCase().includes(filter)) return;

  const div = document.createElement('div');
  div.className = 'log-line';

  const time = new Date(entry.timestamp);
  const ts = [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');

  div.innerHTML =
    '<span class="log-time">' + ts + '</span> ' +
    '<span class="log-level-' + entry.level + '">' + entry.level.toUpperCase().padEnd(5) + '</span> ' +
    '<span class="log-module">' + esc(entry.module) + '</span> ' +
    '<span>' + esc(entry.message) + '</span>';

  if (entry.error) {
    div.innerHTML += '<br><span class="log-level-error">  ' + esc(entry.error.message) + '</span>';
  }

  container.appendChild(div);

  if (document.getElementById('autoScroll').checked) {
    container.scrollTop = container.scrollHeight;
  }
}

function filterLogs() {
  const container = document.getElementById('logContainer');
  container.innerHTML = '';
  for (const entry of logs) {
    renderLogEntry(entry);
  }
}

function clearLogs() {
  logs = [];
  document.getElementById('logContainer').innerHTML = '';
  document.getElementById('logCount').textContent = '0 entries';
}

// ─── Process Control ──────────────────

async function apiAction(action) {
  try {
    const resp = await fetch('/api/process/' + action, { method: 'POST' });
    const data = await resp.json();
    updateProcessStatus(data.info || data);
  } catch (err) {
    console.error('Action failed:', err);
  }
}

function updateProcessStatus(info) {
  const status = info.status || info;
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');

  badge.className = 'status-badge status-' + status;
  text.textContent = status;

  document.getElementById('btnStart').disabled = (status === 'running' || status === 'starting');
  document.getElementById('btnStop').disabled = (status === 'stopped' || status === 'stopping');
  document.getElementById('btnRestart').disabled = (status === 'stopped');
}

// ─── Tabs ─────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');

    // Load data for the tab
    const t = tab.dataset.tab;
    if (t === 'overview') loadOverview();
    if (t === 'goals') loadGoals();
    if (t === 'events') loadEvents();
    if (t === 'turns') loadTurns();
    if (t === 'heartbeat') loadHeartbeat();
    if (t === 'knowledge') loadKnowledge();
    if (t === 'soul') loadSoul();
    if (t === 'config') loadConfig();
  });
});

// ─── Data Loading ─────────────────────

async function loadOverview() {
  try {
    const data = await (await fetch('/api/status')).json();
    document.getElementById('agentName').textContent = data.name || '—';

    const cards = [
      { label: 'State', value: data.state, sub: 'Agent state' },
      { label: 'Turns', value: data.turnCount, sub: 'Total turns completed' },
      { label: 'Model', value: data.model, sub: 'Active inference model' },
      { label: 'Tools', value: data.toolCount, sub: 'Installed tools' },
      { label: 'Skills', value: data.skillCount, sub: 'Active skills' },
      { label: 'Children', value: data.childrenAlive + '/' + data.childrenTotal, sub: 'Alive / total' },
      { label: 'Version', value: data.version, sub: 'Automaton version' },
      { label: 'Uptime', value: data.process?.uptimeMs ? formatDuration(data.process.uptimeMs) : '—', sub: 'Process uptime' },
    ];

    document.getElementById('overviewCards').innerHTML = cards.map(c =>
      '<div class="card"><div class="card-label">' + c.label + '</div>' +
      '<div class="card-value">' + esc(String(c.value ?? '—')) + '</div>' +
      '<div class="card-sub">' + c.sub + '</div></div>'
    ).join('');

    updateProcessStatus(data.process || {});

    const tbody = document.querySelector('#recentTurnsTable tbody');
    tbody.innerHTML = (data.recentTurns || []).map(t =>
      '<tr><td>' + esc(t.id?.slice(-8) || '') + '</td>' +
      '<td>' + t.toolCalls + '</td>' +
      '<td>' + t.tokens + '</td>' +
      '<td>' + timeAgo(t.timestamp) + '</td></tr>'
    ).join('');
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

async function loadGoals() {
  try {
    const goals = await (await fetch('/api/goals')).json();
    const tasks = await (await fetch('/api/tasks/ready')).json();

    const tbody = document.querySelector('#goalsTable tbody');
    tbody.innerHTML = (goals || []).map(g =>
      '<tr><td>' + esc(g.title) + '</td>' +
      '<td><span class="tag tag-' + g.status + '">' + g.status + '</span></td>' +
      '<td>$' + ((g.actualRevenueCents || 0) / 100).toFixed(2) + '</td>' +
      '<td>' + timeAgo(g.createdAt) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="color:var(--text2)">No active goals</td></tr>';

    const ttbody = document.querySelector('#tasksTable tbody');
    ttbody.innerHTML = (tasks || []).map(t =>
      '<tr><td>' + esc(t.title) + '</td>' +
      '<td>' + esc(t.goalId?.slice(-6) || '') + '</td>' +
      '<td><span class="tag tag-' + t.status + '">' + t.status + '</span></td>' +
      '<td>' + t.priority + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="color:var(--text2)">No ready tasks</td></tr>';
  } catch (err) {
    console.error('Failed to load goals:', err);
  }
}

async function loadEvents() {
  try {
    const filter = document.getElementById('eventFilter')?.value;
    let url = '/api/events?limit=200';
    if (filter) url += '&type=' + encodeURIComponent(filter);
    const events = await (await fetch(url)).json();

    const tbody = document.querySelector('#eventsTable tbody');
    tbody.innerHTML = (events || []).map(e =>
      '<tr><td><span class="tag tag-active">' + esc(e.type) + '</span></td>' +
      '<td>' + esc((e.content || '').slice(0, 120)) + '</td>' +
      '<td>' + (e.tokenCount || 0) + '</td>' +
      '<td>' + timeAgo(e.createdAt) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="color:var(--text2)">No events</td></tr>';
  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

async function loadTurns() {
  try {
    const turns = await (await fetch('/api/turns?limit=100')).json();

    const tbody = document.querySelector('#turnsTable tbody');
    tbody.innerHTML = (turns || []).map(t =>
      '<tr><td>' + esc(t.id?.slice(-8) || '') + '</td>' +
      '<td><span class="tag tag-' + (t.state || 'running') + '">' + (t.state || '?') + '</span></td>' +
      '<td>' + (t.toolCalls?.length ?? 0) + '</td>' +
      '<td>' + (t.tokenUsage?.totalTokens ?? 0) + '</td>' +
      '<td>' + (t.costCents || 0).toFixed(1) + '</td>' +
      '<td>' + timeAgo(t.timestamp) + '</td></tr>'
    ).join('') || '<tr><td colspan="6" style="color:var(--text2)">No turns</td></tr>';
  } catch (err) {
    console.error('Failed to load turns:', err);
  }
}

async function loadHeartbeat() {
  try {
    const data = await (await fetch('/api/heartbeat')).json();

    const tbody = document.querySelector('#heartbeatTable tbody');
    tbody.innerHTML = (data.schedule || []).map(s =>
      '<tr><td>' + esc(s.taskName) + '</td>' +
      '<td>' + esc(s.cronExpr || s.intervalMs + 'ms') + '</td>' +
      '<td>' + (s.enabled ? '✓' : '✗') + '</td>' +
      '<td>' + timeAgo(s.lastRunAt) + '</td>' +
      '<td>' + timeAgo(s.nextRunAt) + '</td></tr>'
    ).join('') || '<tr><td colspan="5" style="color:var(--text2)">No heartbeat tasks</td></tr>';

    const htbody = document.querySelector('#heartbeatHistoryTable tbody');
    htbody.innerHTML = (data.history || []).map(h =>
      '<tr><td>' + esc(h.taskName) + '</td>' +
      '<td><span class="tag tag-' + (h.success ? 'completed' : 'failed') + '">' +
      (h.success ? 'ok' : 'fail') + '</span></td>' +
      '<td>' + (h.durationMs || 0) + 'ms</td>' +
      '<td>' + timeAgo(h.startedAt) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="color:var(--text2)">No history</td></tr>';
  } catch (err) {
    console.error('Failed to load heartbeat:', err);
  }
}

async function loadKnowledge() {
  try {
    const q = document.getElementById('knowledgeSearch')?.value;
    let url = '/api/knowledge?limit=100';
    if (q) url += '&q=' + encodeURIComponent(q);
    const data = await (await fetch(url)).json();

    const tbody = document.querySelector('#knowledgeTable tbody');
    tbody.innerHTML = (data || []).map(k =>
      '<tr><td><span class="tag tag-active">' + esc(k.category) + '</span></td>' +
      '<td>' + esc(k.key) + '</td>' +
      '<td>' + esc((k.content || '').slice(0, 150)) + '</td>' +
      '<td>' + (k.confidence != null ? k.confidence.toFixed(2) : '—') + '</td></tr>'
    ).join('') || '<tr><td colspan="4" style="color:var(--text2)">No knowledge entries</td></tr>';
  } catch (err) {
    console.error('Failed to load knowledge:', err);
  }
}

async function loadSoul() {
  try {
    const data = await (await fetch('/api/soul')).json();
    document.getElementById('soulContent').textContent = data.content || 'No SOUL.md found';
  } catch (err) {
    document.getElementById('soulContent').textContent = 'Failed to load SOUL.md';
  }
}

async function loadConfig() {
  try {
    const data = await (await fetch('/api/config')).json();
    document.getElementById('configContent').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    document.getElementById('configContent').textContent = 'Failed to load config';
  }
}

// ─── Utilities ────────────────────────

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return 'in ' + formatDuration(-diff);
  if (diff < 60000) return Math.round(diff / 1000) + 's ago';
  if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.round(diff / 3600000) + 'h ago';
  return Math.round(diff / 86400000) + 'd ago';
}

function formatDuration(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  if (ms < 3600000) return Math.round(ms / 60000) + 'm';
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return h + 'h ' + m + 'm';
}

// ─── Initial Load ─────────────────────

loadOverview();
</script>

</body>
</html>`;
}
