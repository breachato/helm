'use strict';
history.scrollRestoration = 'manual';
const API = window.HELM_API.replace(/\/$/, '');
const $ = id => document.getElementById(id);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

let token = store.get('helm-token');
let servers = [], current = store.get('helm-server'), me = null;
let players = { servers: {} }, lastLog = '', logBusy = false;
const cmdHistory = []; let hIdx = 0;

// ---------- Utilita' ----------
function toast(msg, err) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast' + (err ? ' err' : ''), 2800);
}
async function api(path, body) {
  const r = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { logout(); throw new Error('auth'); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmtBytes = b => !b ? '0' : b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(0) + ' MB';
function fmtUp(ms) {
  if (!ms) return '–';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return d ? `${d}g ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const STATE_IT = { running: 'online', offline: 'offline', starting: 'in avvio', stopping: 'in arresto' };

// Nome Pelican -> gruppo + etichetta ("Coreline Shooter - FdO", "NEXT Hub")
function split(name) {
  const i = name.indexOf(' - ');
  if (i > 0) return { group: name.slice(0, i), label: name.slice(i + 3) };
  const [g, ...rest] = name.split(' ');
  return rest.length ? { group: g, label: rest.join(' ') } : { group: 'Altri', label: name };
}

// ---------- ANSI -> HTML ----------
const PAL = ['#3b3b3b', '#f88a8a', '#6ee7b7', '#fbe27a', '#8fb5ff', '#c4b5fd', '#7dd3e8', '#d6d6d6',
             '#6b6b6b', '#ffa3a3', '#9af0c8', '#fdeea0', '#adc8ff', '#d8ccff', '#a5e4f2', '#ffffff'];
function c256(n) {
  if (n < 16) return PAL[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  n -= 16; const f = x => x ? 55 + x * 40 : 0;
  return `rgb(${f(Math.floor(n / 36))},${f(Math.floor(n / 6) % 6)},${f(n % 6)})`;
}
function ansi(text) {
  text = text.replace(/\x1b\[\?[0-9;]*[a-zA-Z]|\x1b[=>]|\x1b\[[0-9;]*[A-LN-Za-z]/g, '')
    .split(/\r?\n/).map(l => l.replace(/^(>\.{4})+/, '').replace(/\r/g, '')).join('\n');
  let out = '', fg = null, bold = false;
  const parts = text.split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2) {
      const c = parts[i].split(';').map(Number);
      for (let k = 0; k < c.length; k++) {
        const n = c[k] || 0;
        if (n === 0) { fg = null; bold = false; }
        else if (n === 1) bold = true;
        else if (n === 22) bold = false;
        else if (n === 39) fg = null;
        else if (n >= 30 && n <= 37) fg = PAL[n - 30];
        else if (n >= 90 && n <= 97) fg = PAL[n - 82];
        else if (n === 38 && c[k + 1] === 5) { fg = c256(c[k + 2]); k += 2; }
        else if (n === 38 && c[k + 1] === 2) { fg = `rgb(${c[k + 2]},${c[k + 3]},${c[k + 4]})`; k += 4; }
      }
    } else if (parts[i]) {
      const st = (fg ? `color:${fg};` : '') + (bold ? 'font-weight:600;' : '');
      out += st ? `<span style="${st}">${esc(parts[i])}</span>` : esc(parts[i]);
    }
  }
  return out;
}

// ---------- Avvio ----------
function hideBoot() { $('boot').classList.add('out'); setTimeout(() => { $('boot').hidden = true; }, 600); }
const focusCmd = () => { if (matchMedia('(pointer: fine)').matches) $('cmd').focus({ preventScroll: true }); };
async function wake() {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(API + '/health', { cache: 'no-store' });
      if (r.ok) return true;
    } catch {}
    const s = Math.round((Date.now() - t0) / 1000);
    $('bootTxt').textContent = s < 4 ? 'Connessione…' : `Risveglio del server… ${s}s`;
    if (s > 120) { $('bootTxt').textContent = 'Il server non risponde. Riprova tra poco.'; return false; }
    await new Promise(r => setTimeout(r, 2000));
  }
}

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('token')) { token = h.get('token'); store.set('helm-token', token); }
  const err = h.get('error');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  return err;
}

async function boot() {
  const err = readHash();
  if (!(await wake())) return;
  if (token) {
    try { me = await api('/api/me'); return startApp(); } catch {}
  }
  showLogin(err);
}

// ---------- Login ----------
const ERRORS = {
  denied: 'Questo account non è tra gli owner.',
  discord: 'Login Discord non riuscito, riprova.',
  state: 'Login scaduto, riprova.',
};
let tgPoll = null;
async function showLogin(err) {
  hideBoot();
  $('app').hidden = true; $('login').hidden = false;
  $('loginErr').textContent = ERRORS[err] || (err ? 'Accesso non riuscito.' : '');
  try {
    const p = await fetch(API + '/auth/providers').then(r => r.json());
    $('discordBtn').hidden = !p.discord;
    $('tgBtn').hidden = !p.telegram;
  } catch { $('loginErr').textContent = 'Backend non raggiungibile.'; }
}
$('discordBtn').onclick = () => { location.href = API + '/auth/discord'; };
$('tgBtn').onclick = async () => {
  $('tgBtn').disabled = true; $('loginErr').textContent = '';
  try {
    const r = await fetch(API + '/auth/telegram/start', { method: 'POST' }).then(r => r.json());
    if (!r.link) throw new Error();
    $('tgLink').href = r.link; $('tgLink').textContent = 'Apri @' + r.bot;
    $('tgWait').hidden = false;
    window.open(r.link, '_blank', 'noopener');
    clearInterval(tgPoll);
    tgPoll = setInterval(async () => {
      const c = await fetch(API + '/auth/telegram/check?code=' + r.code).then(r => r.json()).catch(() => ({}));
      if (c.status === 'ok') { clearInterval(tgPoll); token = c.token; store.set('helm-token', token); me = await api('/api/me'); startApp(); }
      else if (c.status === 'denied' || c.status === 'expired') {
        clearInterval(tgPoll); $('tgWait').hidden = true; $('tgBtn').disabled = false;
        $('loginErr').textContent = c.status === 'denied' ? 'Questo account Telegram non è tra gli owner.' : 'Tempo scaduto, riprova.';
      }
    }, 1500);
  } catch { $('tgBtn').disabled = false; $('loginErr').textContent = 'Avvio login Telegram non riuscito.'; }
};
function logout() {
  token = null; store.set('helm-token', null);
  location.reload();
}
$('logout').onclick = logout;

// ---------- App ----------
let timers = [];
function startApp() {
  hideBoot();
  $('login').hidden = true; $('app').hidden = false; $('app').classList.add('fade');
  $('who').textContent = me.who; $('pelican').href = me.panelUrl;
  loadServers().then(() => { loadLogs(); loadPlayers(); });
  timers.push(setInterval(loadServers, 5000), setInterval(loadLogs, 2000));
  focusCmd();
}

function playersOf(s) {
  // Velocity chiama i server "hub", "dev", ...: li abbino alle parole del nome Pelican.
  const words = s.name.toLowerCase().split(/[\s()-]+/);
  for (const [k, list] of Object.entries(players.servers)) if (words.includes(k.toLowerCase())) return list;
  return null;
}

function renderSide() {
  const groups = {};
  for (const s of servers) (groups[split(s.name).group] ||= []).push(s);
  const side = $('side'); side.innerHTML = '';
  for (const g of Object.keys(groups).sort((a, b) => a === 'NEXT' ? -1 : b === 'NEXT' ? 1 : a.localeCompare(b))) {
    const list = groups[g].sort((a, b) => split(a.name).label.localeCompare(split(b.name).label));
    const on = list.filter(s => s.state === 'running').length;
    const box = document.createElement('div'); box.className = 'group';
    box.innerHTML = `<h3><span>${esc(g)}</span><span>${on}/${list.length}</span></h3>`;
    for (const s of list) {
      const pl = playersOf(s);
      const pct = s.memlim ? Math.min(100, s.mem / s.memlim * 100) : 0;
      const b = document.createElement('button');
      b.className = 'srv' + (s.uuid === current ? ' active' : '');
      b.innerHTML = `<span class="dot ${s.state}"></span><span class="name">${esc(split(s.name).label)}</span>` +
        `<span class="pl">${pl && pl.length ? pl.length + ' pl' : ''}</span>` +
        (s.state === 'running'
          ? `<span class="meta"><span>${s.cpu.toFixed(1)}%</span><span>${fmtBytes(s.mem)}</span></span><span class="bar"><span style="width:${pct}%"></span></span>`
          : `<span class="meta"><span>${STATE_IT[s.state] || s.state}</span></span>`);
      b.onclick = () => select(s.uuid);
      box.appendChild(b);
    }
    side.appendChild(box);
  }
}

function renderHead() {
  const s = servers.find(x => x.uuid === current);
  if (!s) return;
  const { group, label } = split(s.name);
  $('title').textContent = label; $('grp').textContent = group;
  $('stDot').className = 'dot ' + s.state; $('stTxt').textContent = '· ' + (STATE_IT[s.state] || s.state);
  $('shell').href = 'helm-shell:' + s.uuid;
  const run = s.state === 'running';
  $('sCpu').textContent = run ? s.cpu.toFixed(1) + '%' : '–';
  $('sMem').innerHTML = run ? `${fmtBytes(s.mem)} <small>/ ${fmtBytes(s.memlim)}</small>` : '–';
  $('sDisk').textContent = fmtBytes(s.disk);
  $('sUp').textContent = run ? fmtUp(s.uptime) : '–';
}

async function loadServers() {
  try {
    servers = await api('/api/servers');
    if (!servers.find(s => s.uuid === current)) current = (servers.find(s => s.uuid === me.proxy) || servers[0] || {}).uuid;
    renderSide(); renderHead();
  } catch (e) { if (e.message !== 'auth') toast('Lista server non disponibile', true); }
}

function select(uuid) {
  current = uuid; store.set('helm-server', uuid);
  lastLog = ''; $('console').innerHTML = '<span class="muted">Carico i log…</span>'; delete $('console').dataset.init;
  renderSide(); renderHead(); loadLogs(); focusCmd();
}

async function loadLogs() {
  if (logBusy || !current) return; logBusy = true;
  const u = current;
  try {
    const { text } = await api(`/api/logs?u=${u}&n=400`);
    if (u !== current || text === lastLog) return;
    lastLog = text;
    const c = $('console'), atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
    c.innerHTML = ansi(text.trim()) || '<span class="muted">Nessun log: il server è spento.</span>';
    if (atBottom || !c.dataset.init) { c.scrollTop = c.scrollHeight; c.dataset.init = 1; }
  } catch {} finally { logBusy = false; }
}

async function loadPlayers() {
  try { players = await api('/api/players'); $('onlineNum').textContent = players.total; renderSide(); } catch {}
}
$('online').onclick = loadPlayers;

$('form').onsubmit = async e => {
  e.preventDefault();
  const cmd = $('cmd').value.trim(); if (!cmd || !current) return;
  cmdHistory.push(cmd); hIdx = cmdHistory.length; $('cmd').value = '';
  try {
    const { code } = await api(`/api/cmd?u=${current}`, { cmd });
    if (code !== '204') toast('Risposta ' + code, true);
    setTimeout(loadLogs, 600);
    if (current === me.proxy && /^(send|glist|server)\b/i.test(cmd)) setTimeout(loadPlayers, 1200);
  } catch (err) { toast('Comando non inviato: ' + err.message, true); }
};
$('cmd').onkeydown = e => {
  if (e.key === 'ArrowUp' && hIdx > 0) { $('cmd').value = cmdHistory[--hIdx]; e.preventDefault(); }
  if (e.key === 'ArrowDown') { hIdx = Math.min(cmdHistory.length, hIdx + 1); $('cmd').value = cmdHistory[hIdx] || ''; e.preventDefault(); }
};

// Power: Avvia diretto, le altre azioni chiedono un secondo click entro 3 secondi.
document.querySelectorAll('[data-power]').forEach(b => {
  const label = b.textContent;
  b.onclick = async () => {
    const a = b.dataset.power;
    if (a !== 'start' && !b.classList.contains('confirm')) {
      b.classList.add('confirm'); b.textContent = 'Conferma';
      clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('confirm'); b.textContent = label; }, 3000);
      return;
    }
    clearTimeout(b._t); b.classList.remove('confirm'); b.textContent = label;
    try {
      const { code } = await api(`/api/power?u=${current}`, { action: a });
      toast(code === '204' ? `${label}: inviato` : 'Risposta ' + code, code !== '204');
      setTimeout(loadServers, 1500);
    } catch (e) { toast(e.message, true); }
  };
});

// ---------- Cursore ----------
(() => {
  if (!matchMedia('(pointer: fine)').matches) return;
  const dot = $('cursor');
  let x = -100, y = -100;
  addEventListener('mousemove', e => {
    x = e.clientX; y = e.clientY;
    document.documentElement.classList.add('cursor-on');
    dot.classList.toggle('hover', !!e.target.closest('a, button, .field'));
  });
  addEventListener('mouseleave', () => document.documentElement.classList.remove('cursor-on'));
  (function loop() { dot.style.transform = `translate(${x}px, ${y}px)`; requestAnimationFrame(loop); })();
})();

boot();
