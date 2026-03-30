import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface DashboardClient {
  ws: WebSocket;
  id: string;
}

const clients: Map<string, DashboardClient> = new Map();
let agentStates: any[] = [];
let taskHistory: any[] = [];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenCode Orchestrator — Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; background: #0a0a0f; color: #e0e0e0; }
  .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px 30px; border-bottom: 1px solid #2a2a4a; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; color: #00d4ff; }
  .header .status { font-size: 12px; color: #888; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .card { background: #12121a; border: 1px solid #2a2a3a; border-radius: 8px; padding: 16px; }
  .card h2 { font-size: 13px; color: #00d4ff; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .agent-list { list-style: none; }
  .agent-list li { padding: 8px 0; border-bottom: 1px solid #1a1a2a; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  .agent-list li:last-child { border-bottom: none; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 8px; }
  .status-dot.idle { background: #444; }
  .status-dot.busy { background: #00ff88; animation: pulse 1.5s infinite; }
  .status-dot.error { background: #ff4444; }
  .status-dot.queued { background: #ffaa00; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .task-item { padding: 8px 0; border-bottom: 1px solid #1a1a2a; font-size: 12px; }
  .task-item:last-child { border-bottom: none; }
  .task-status { font-size: 11px; padding: 2px 6px; border-radius: 3px; }
  .task-status.completed { background: #003322; color: #00ff88; }
  .task-status.in_progress { background: #332200; color: #ffaa00; }
  .task-status.failed { background: #330000; color: #ff4444; }
  .task-status.pending { background: #222; color: #888; }
  .metric { text-align: center; padding: 12px; }
  .metric .value { font-size: 28px; color: #00d4ff; font-weight: bold; }
  .metric .label { font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase; }
  .metrics-row { display: flex; gap: 8px; }
  .metrics-row .metric { flex: 1; background: #0a0a12; border-radius: 6px; }
  .log-area { max-height: 300px; overflow-y: auto; font-size: 12px; line-height: 1.6; color: #888; }
  .log-area .log-line { padding: 2px 0; }
  .log-area .log-line.info { color: #00d4ff; }
  .log-area .log-line.warn { color: #ffaa00; }
  .log-area .log-line.error { color: #ff4444; }
  .log-area .log-line.success { color: #00ff88; }
  .wide { grid-column: span 2; }
  .full { grid-column: span 3; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0a0a0f; }
  ::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
</style>
</head>
<body>
<div class="header">
  <h1> OpenCode Orchestrator</h1>
  <div class="status">Connected — <span id="agent-count">0</span> agents active</div>
</div>
<div class="grid">
  <div class="card">
    <h2>Agent Pool</h2>
    <ul class="agent-list" id="agent-list">
      <li><span>Loading agents...</span></li>
    </ul>
  </div>
  <div class="card wide">
    <h2>Metrics</h2>
    <div class="metrics-row">
      <div class="metric"><div class="value" id="tasks-total">0</div><div class="label">Tasks Total</div></div>
      <div class="metric"><div class="value" id="tasks-active">0</div><div class="label">Active</div></div>
      <div class="metric"><div class="value" id="tasks-completed">0</div><div class="label">Completed</div></div>
      <div class="metric"><div class="value" id="tasks-failed">0</div><div class="label">Failed</div></div>
      <div class="metric"><div class="value" id="files-modified">0</div><div class="label">Files Modified</div></div>
      <div class="metric"><div class="value" id="avg-duration">0ms</div><div class="label">Avg Duration</div></div>
    </div>
  </div>
  <div class="card wide">
    <h2>Task History</h2>
    <div id="task-history"></div>
  </div>
  <div class="card">
    <h2>System</h2>
    <div id="system-info" style="font-size: 12px; line-height: 2;"></div>
  </div>
  <div class="card full">
    <h2>Live Activity Log</h2>
    <div class="log-area" id="log-area"></div>
  </div>
</div>
<script>
const ws = new WebSocket('ws://' + window.location.host + '/ws');
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'agents') renderAgents(msg.data);
  if (msg.type === 'tasks') renderTasks(msg.data);
  if (msg.type === 'metrics') renderMetrics(msg.data);
  if (msg.type === 'log') appendLog(msg.data);
  if (msg.type === 'system') renderSystem(msg.data);
};
ws.onopen = () => appendLog({ level: 'success', message: 'Connected to orchestrator' });
ws.onclose = () => appendLog({ level: 'error', message: 'Disconnected' });

function renderAgents(agents) {
  const el = document.getElementById('agent-list');
  document.getElementById('agent-count').textContent = agents.filter(a => a.status === 'busy').length;
  el.innerHTML = agents.map(a => '<li><span><span class="status-dot ' + a.status + '"></span>' + a.name + '</span><span style="color:#666;font-size:11px">' + a.status + '</span></li>').join('');
}

function renderTasks(tasks) {
  const el = document.getElementById('task-history');
  el.innerHTML = tasks.slice(-20).reverse().map(t => '<div class="task-item"><span>' + t.description + '</span><span class="task-status ' + t.status + '">' + t.status + '</span></div>').join('');
}

function renderMetrics(m) {
  document.getElementById('tasks-total').textContent = m.total || 0;
  document.getElementById('tasks-active').textContent = m.active || 0;
  document.getElementById('tasks-completed').textContent = m.completed || 0;
  document.getElementById('tasks-failed').textContent = m.failed || 0;
  document.getElementById('files-modified').textContent = m.filesModified || 0;
  document.getElementById('avg-duration').textContent = (m.avgDuration || 0) + 'ms';
}

function appendLog(log) {
  const el = document.getElementById('log-area');
  const line = document.createElement('div');
  line.className = 'log-line ' + (log.level || 'info');
  line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + log.message;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function renderSystem(info) {
  const el = document.getElementById('system-info');
  el.innerHTML = Object.entries(info).map(([k,v]) => '<div><span style="color:#666">' + k + ':</span> ' + v + '</div>').join('');
}
</script>
</body>
</html>`;

export async function startDashboard(port: number = 3847): Promise<void> {
  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else if (req.url === '/api/agents') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(agentStates));
    } else if (req.url === '/api/tasks') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(taskHistory));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const id = Math.random().toString(36).slice(2);
    clients.set(id, { ws, id });

    ws.send(JSON.stringify({ type: 'agents', data: agentStates }));
    ws.send(JSON.stringify({ type: 'tasks', data: taskHistory }));
    ws.send(JSON.stringify({
      type: 'system',
      data: {
        'Node': process.version,
        'Platform': process.platform + ' ' + process.arch,
        'Uptime': Math.floor(process.uptime()) + 's',
        'Memory': Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      }
    }));

    ws.on('close', () => clients.delete(id));
  });

  function broadcast(msg: any) {
    const data = JSON.stringify(msg);
    for (const client of clients.values()) {
      client.ws.send(data);
    }
  }

  server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });

  setInterval(() => {
    broadcast({
      type: 'system',
      data: {
        'Node': process.version,
        'Platform': process.platform + ' ' + process.arch,
        'Uptime': Math.floor(process.uptime()) + 's',
        'Memory': Math.floor(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        'Clients': clients.size,
      }
    });
  }, 5000);
}

export function updateAgentStates(agents: any[]) {
  agentStates = agents;
  const data = JSON.stringify({ type: 'agents', data: agents });
  for (const client of clients.values()) {
    client.ws.send(data);
  }
}

export function addTaskToHistory(task: any) {
  taskHistory.push({ ...task, timestamp: Date.now() });
  const data = JSON.stringify({ type: 'tasks', data: taskHistory.slice(-50) });
  for (const client of clients.values()) {
    client.ws.send(data);
  }
}

export function pushLog(level: string, message: string) {
  const data = JSON.stringify({ type: 'log', data: { level, message, timestamp: Date.now() } });
  for (const client of clients.values()) {
    client.ws.send(data);
  }
}
