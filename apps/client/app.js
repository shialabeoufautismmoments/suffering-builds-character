const State = { code: '', data: null, view: 'today', busy: false, since: null, editMatch: null, editStat: null, avatarPanelOpen: false };
const app = document.getElementById('app');
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const fmt = iso => iso ? new Date(iso + (iso.length <= 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

function toast(message, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  document.getElementById('toast-host').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

const QUEUE_KEY = 'coachsbc-client-pending';
const SEEN_KEY = 'coachsbc-client-seen';
function lsGet(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}
function loadQueue() { return lsGet(QUEUE_KEY, []); }
function saveQueue(q) { lsSet(QUEUE_KEY, q || []); }

// Concatenate several change-sets into one, merging same-named arrays — used
// to flush a backlog of offline edits in a single request.
function mergeChanges(list) {
  const merged = {};
  (list || []).forEach(ch => Object.entries(ch || {}).forEach(([k, v]) => {
    if (Array.isArray(v)) merged[k] = (merged[k] || []).concat(v);
  }));
  return merged;
}

// Snapshot the IDs currently on screen so the next visit can diff against them.
function markSeen() {
  lsSet(SEEN_KEY, {
    vods: vods().map(v => v.id),
    homework: sessions().flatMap(s => (s.homework || []).map(h => h.id)),
    sessions: sessions().map(s => s.id)
  });
}

// New-since-last-open counts, from diffing current IDs against the set saved
// on the previous visit. Null on a first visit or when nothing is new.
function computeSinceLastVisit() {
  const seen = lsGet(SEEN_KEY, null);
  if (!seen || !seen.vods) return null;
  const absent = (arr, id) => !(arr || []).includes(id);
  const newVods = vods().filter(v => absent(seen.vods, v.id)).length;
  const newHw = sessions().flatMap(s => (s.homework || []).map(h => h.id)).filter(id => absent(seen.homework, id)).length;
  const newSessions = sessions().filter(s => absent(seen.sessions, s.id)).length;
  if (!newVods && !newHw && !newSessions) return null;
  return { newVods, newHw, newSessions };
}

async function boot() {
  const cache = await window.clientApi.cacheGet();
  State.code = cache.lastCode || '';
  State.data = cache.workspace || null;
  if (State.data && State.code) {
    State.since = computeSinceLastVisit();
    markSeen();
    flushQueue(true);
    renderShell();
  } else {
    renderLogin();
  }
}

function renderLogin(error = '') {
  app.innerHTML = `<div class="login">
    <form class="login-card" onsubmit="login(event)">
      <h1><span class="dot"></span>CoachSBC Client</h1>
      <p>Enter the unique client code your coach gave you. This app only loads your own program, homework, match logs, and KovaaK's stats.</p>
      <label class="field"><span>Client code</span><input id="code" value="${E(State.code)}" placeholder="SBC-XXXX-XXXX" autocomplete="off"></label>
      ${error ? `<p class="bad">${E(error)}</p>` : ''}
      <button class="btn btn-primary" id="login-btn">Unlock my program</button>
    </form>
  </div>`;
}

async function login(event) {
  event.preventDefault();
  const code = document.getElementById('code').value.trim().toUpperCase();
  if (!code) return renderLogin('Enter your client code.');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Syncing...';
  try {
    const result = await window.clientApi.workspaceGet(code);
    State.code = code;
    State.data = result.data;
    State.since = computeSinceLastVisit();
    markSeen();
    renderShell();
  } catch (e) {
    renderLogin(e.message || 'Could not unlock this client.');
  }
}

function nav(view) {
  if (view !== 'matches') State.editMatch = null;
  if (view !== 'kovaaks') State.editStat = null;
  State.view = view;
  renderShell();
}
function client() { return State.data && State.data.client || {}; }
function matches() { return State.data && State.data.matches || []; }
function sessions() { return State.data && State.data.sessions || []; }
function plans() { return State.data && State.data.developmentPlans || []; }
function playlists() { return State.data && State.data.playlists || []; }
function vods() { return State.data && State.data.vods || []; }
function isVodUnread(vod) { return vod && vod.clientStatus !== 'watched' && !vod.clientViewedAt; }
function unreadVods() { return vods().filter(isVodUnread); }

function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}
function avatarBadgeHtml(c) {
  return c.avatar
    ? `<img class="badge-avatar" src="${c.avatar}" alt="">`
    : `<span class="badge-avatar badge-avatar-fallback">${E(initials(c.name))}</span>`;
}

function renderShell() {
  const c = client();
  const pending = loadQueue().length;
  const tabs = [['today', 'Today'], ['dashboard', 'Overview'], ['matches', 'Matches'], ['kovaaks', "KovaaK's"], ['homework', 'Homework'], ['sessions', 'Sessions'], ['plans', 'Plan'], ['playlists', 'Playlists'], ['vods', `Reviews${unreadVods().length ? ` (${unreadVods().length})` : ''}`]];
  app.innerHTML = `<div class="shell">
    <div class="topbar">
      <div class="brand"><span class="dot"></span>CoachSBC Client</div>
      <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${State.view === id ? 'on' : ''}" onclick="nav('${id}')">${label}</button>`).join('')}</div>
      <div class="spacer"></div>
      ${pending ? `<span class="pill pending-pill" title="Changes waiting to sync">${pending} pending</span>` : ''}
      <button class="client-badge" onclick="toggleAvatarPanel()" title="Set your profile photo">
        ${avatarBadgeHtml(c)}<span>${E(c.name || 'Client')} ${c.rank ? '- ' + E(c.rank) : ''}</span>
      </button>
      <button class="btn btn-sm" onclick="syncPull()">Refresh</button>
      <button class="btn btn-sm" onclick="logout()">Lock</button>
    </div>
    <main class="main">${avatarPanelHtml()}${bannerHtml()}${renderView()}</main>
  </div>`;
}

function avatarPanelHtml() {
  if (!State.avatarPanelOpen) return '';
  const c = client();
  return `<div class="card mb">
    <div class="card-head"><h2>Profile photo</h2><button class="btn btn-sm" onclick="toggleAvatarPanel()">Close</button></div>
    <div class="avatar-panel-preview">${avatarBadgeHtml(c)}</div>
    <div class="row">
      <input id="avatar-discord-id" value="${E(c.discordId || '')}" placeholder="Your Discord User ID (numeric)">
      <button class="btn btn-primary" onclick="fetchDiscordAvatar()">Grab my Discord photo</button>
    </div>
    <p class="muted small mt">Right-click your name in Discord and "Copy User ID" (enable Developer Mode in Discord settings if you don't see that option). This only reads your public avatar - nothing else.</p>
  </div>`;
}

function toggleAvatarPanel() {
  State.avatarPanelOpen = !State.avatarPanelOpen;
  renderShell();
}

async function fetchDiscordAvatar() {
  const discordId = document.getElementById('avatar-discord-id').value.trim();
  if (!/^\d{17,20}$/.test(discordId)) return toast('Enter a valid numeric Discord User ID.', 'bad');
  try {
    const result = await window.clientApi.discordAvatarLookup(State.code, discordId);
    if (!result.success) return toast(result.msg || 'Could not find that Discord avatar.', 'bad');
    State.avatarPanelOpen = false;
    await syncChanges({ avatar: { avatarDataUrl: result.avatarDataUrl, discordId: result.userId } }, 'Profile photo updated.');
  } catch (e) {
    toast(e.message || 'Discord avatar lookup failed.', 'bad');
  }
}

function bannerHtml() {
  if (!State.since) return '';
  const parts = [];
  if (State.since.newVods) parts.push(`${State.since.newVods} new review${State.since.newVods === 1 ? '' : 's'}`);
  if (State.since.newHw) parts.push(`${State.since.newHw} new homework`);
  if (State.since.newSessions) parts.push(`${State.since.newSessions} new session note${State.since.newSessions === 1 ? '' : 's'}`);
  if (!parts.length) return '';
  return `<div class="banner"><span>Since your last visit: <b>${parts.join(', ')}</b>.</span><button class="banner-x" onclick="dismissBanner()">Dismiss</button></div>`;
}
function dismissBanner() { State.since = null; renderShell(); }

function renderView() {
  if (State.view === 'today') return renderToday();
  if (State.view === 'matches') return renderMatches();
  if (State.view === 'kovaaks') return renderKovaaks();
  if (State.view === 'homework') return renderHomework();
  if (State.view === 'sessions') return renderSessions();
  if (State.view === 'plans') return renderPlans();
  if (State.view === 'playlists') return renderPlaylists();
  if (State.view === 'vods') return renderVods();
  return renderDashboard();
}

// Every date the client did *something* — logged a match/stat, completed
// homework or a prescription, checked in a goal, or engaged with a VOD
// review. Streak is derived from this instead of a separate tracked field,
// so it needs no backend changes and can't drift out of sync with the data.
function activityDates() {
  const c = client();
  const dates = new Set();
  matches().forEach(m => m.date && dates.add(m.date));
  (c.clientKovaaksStats || []).forEach(s => s.date && dates.add(s.date));
  sessions().forEach(s => (s.homework || []).forEach(h => h.clientCompletedAt && dates.add(h.clientCompletedAt.slice(0, 10))));
  plans().forEach(p => {
    (p.actions || []).forEach(a => (a.completions || []).forEach(comp => comp.date && dates.add(comp.date)));
    (p.goals || []).forEach(g => (g.history || []).forEach(h => h.date && dates.add(h.date)));
  });
  vods().forEach(v => {
    if (v.clientViewedAt) dates.add(v.clientViewedAt.slice(0, 10));
    (v.notes || []).forEach(n => (n.clientReplies || []).forEach(r => r.at && dates.add(r.at.slice(0, 10))));
  });
  return dates;
}

// Generic mini trend line for a { date, value } series, used for goal
// check-in history and KovaaK's PR history. Returns '' below 2 points.
function sparklineSvg(points) {
  const clean = (points || [])
    .filter(p => p && p.date && Number.isFinite(Number(p.value)))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (clean.length < 2) return '';
  const width = 120, height = 32, pad = 3;
  const values = clean.map(p => Number(p.value));
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = (width - pad * 2) / (clean.length - 1);
  const coords = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="display:block;flex-shrink:0"><polyline points="${coords}" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`;
}

function computeStreak() {
  const dates = activityDates();
  const activeToday = dates.has(today());
  // Don't zero out the streak just because today isn't logged yet — the day
  // isn't over. Start counting from yesterday in that case.
  const cursor = activeToday ? new Date() : new Date(Date.now() - 86400000);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, activeToday };
}

function buildShareCanvas() {
  const c = client();
  const { streak } = computeStreak();
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 420;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 800, 420);
  grad.addColorStop(0, '#11161d');
  grad.addColorStop(1, '#0d1117');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 800, 420);
  ctx.fillStyle = '#e8833a';
  ctx.beginPath(); ctx.arc(48, 56, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e6edf3';
  ctx.font = '700 22px Segoe UI, sans-serif';
  ctx.fillText('CoachSBC', 66, 64);
  ctx.fillStyle = '#e8833a';
  ctx.font = '800 140px Segoe UI, sans-serif';
  ctx.fillText(String(streak), 48, 250);
  ctx.fillStyle = '#e6edf3';
  ctx.font = '600 28px Segoe UI, sans-serif';
  ctx.fillText(`${streak === 1 ? 'day' : 'days'} practice streak`, 48, 290);
  ctx.fillStyle = '#9aa6b2';
  ctx.font = '500 20px Segoe UI, sans-serif';
  ctx.fillText(c.name || 'Client', 48, 330);
  const topPr = Object.entries(c.prs || {}).sort((a, b) => (b[1].lastDate || '').localeCompare(a[1].lastDate || ''))[0];
  if (topPr) {
    ctx.fillStyle = '#3fb950';
    ctx.font = '600 18px Segoe UI, sans-serif';
    ctx.fillText(`Latest PR: ${topPr[0]} - ${topPr[1].pr}`, 48, 365);
  }
  return canvas;
}

async function shareStreak() {
  const canvas = buildShareCanvas();
  canvas.toBlob(async blob => {
    if (!blob) return toast('Could not generate image.', 'bad');
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('unsupported');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Streak card copied - paste it in Discord.', 'good');
    } catch (e) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'coachsbc-streak.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('Streak card downloaded.', 'good');
    }
  }, 'image/png');
}

function renderToday() {
  const activePlan = plans().find(p => p.status === 'active') || plans()[0];
  const { streak, activeToday } = computeStreak();

  const dueHomework = sessions().flatMap(s => (s.homework || []).map(h => ({ ...h, session: s })))
    .filter(h => !h.done)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const dueOrOverdue = dueHomework.filter(h => h.dueDate && h.dueDate <= today());

  const prescriptions = activePlan ? (activePlan.actions || []).map(a => {
    const weekCount = (a.completions || []).filter(c => c.date >= weekStart()).length;
    const doneToday = (a.completions || []).some(c => c.date === today());
    return { action: a, weekCount, doneToday, onPace: weekCount >= (a.targetPerWeek || 1) };
  }) : [];

  return `<div class="page-head"><div><h1>Today</h1><div class="sub">${fmt(today())}</div></div></div>
    <div class="grid cols-3 mb">
      <div class="stat">
        <div class="label">Current streak</div>
        <div class="value ${streak > 0 ? 'accent' : ''}">${streak}</div>
        <div class="muted">day${streak === 1 ? '' : 's'}${activeToday ? '' : ' - not logged today yet'}</div>
        ${streak > 0 ? `<button class="btn btn-sm mt" onclick="shareStreak()">Share streak card</button>` : ''}
      </div>
      <div class="stat"><div class="label">Due today</div><div class="value ${dueOrOverdue.length ? 'warn' : 'good'}">${dueOrOverdue.length}</div><div class="muted">homework item${dueOrOverdue.length === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="label">Prescriptions on pace</div><div class="value">${prescriptions.filter(p => p.onPace).length}/${prescriptions.length}</div><div class="muted">this week</div></div>
    </div>
    ${activePlan ? `<div class="card mb">
      <div class="card-head"><h2>Today's prescriptions</h2><span class="pill">${E(activePlan.title)}</span></div>
      ${(activePlan.actions || []).length ? (activePlan.actions || []).map(action => actionRowHtml(activePlan, action)).join('') : '<div class="empty">No weekly prescriptions assigned.</div>'}
    </div>` : ''}
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Homework due</h2><button class="btn btn-sm" onclick="nav('homework')">View all</button></div>
        ${dueHomework.length ? dueHomework.slice(0, 5).map(h => homeworkRowHtml(h.session, h)).join('') : '<div class="empty">Nothing due. Nice.</div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Today's training</h2><button class="btn btn-sm" onclick="nav('playlists')">View all</button></div>
        ${playlists().length ? playlists().slice(0, 3).map(p => `<div class="list-row"><div><b>${E(p.name)}</b><div class="muted">${(p.scenarios || []).length} scenarios</div></div></div>`).join('') : '<div class="empty">No playlists assigned yet.</div>'}
      </div>
    </div>`;
}

function renderDashboard() {
  const c = client();
  const openHw = sessions().flatMap(s => (s.homework || []).map(h => ({ ...h, session: s }))).filter(h => !h.done);
  const statRows = c.clientKovaaksStats || [];
  const activePlan = plans().find(p => p.status === 'active') || plans()[0];
  const wins = matches().filter(m => m.result === 'Win').length;
  const losses = matches().filter(m => m.result === 'Loss').length;
  return `<div class="page-head"><div><h1>${E(c.name || 'Your program')}</h1><div class="sub">${E(c.game || '')} ${c.rank ? '- ' + E(c.rank) : ''}</div></div></div>
    <div class="grid cols-3 mb">
      <div class="stat"><div class="label">Matches logged</div><div class="value">${matches().length}</div><div class="muted">${wins}-${losses}</div></div>
      <div class="stat"><div class="label">KovaaK's logs</div><div class="value accent">${statRows.length}</div><div class="muted">manual entries</div></div>
      <div class="stat"><div class="label">Open homework</div><div class="value ${openHw.length ? 'warn' : 'good'}">${openHw.length}</div><div class="muted">remaining</div></div>
      <div class="stat"><div class="label">VOD reviews</div><div class="value">${vods().length}</div><div class="muted">${unreadVods().length ? `${unreadVods().length} unread` : 'from coach'}</div></div>
    </div>
    ${activePlan ? `<div class="card mb"><div class="card-head"><h2>${E(activePlan.title)}</h2><span class="pill">${E(activePlan.status)}</span></div><p class="muted">${E(activePlan.objective || 'No objective written yet.')}</p></div>` : ''}
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Recent matches</h2><button class="btn btn-sm" onclick="nav('matches')">Log match</button></div>${matchTable(matches().slice(-5).reverse())}</div>
      <div class="card"><div class="card-head"><h2>Latest KovaaK's</h2><button class="btn btn-sm" onclick="nav('kovaaks')">Add stat</button></div>${kovaaksTable(statRows.slice(-5).reverse())}</div>
    </div>`;
}

function renderMatches() {
  const em = State.editMatch || {};
  const editing = !!State.editMatch;
  const opt = (x, sel) => `<option ${sel === x ? 'selected' : ''}>${x}</option>`;
  return `<div class="page-head"><div><h1>Match Tracker</h1><div class="sub">Manually enter ranked games, scrims, replay codes, heroes, and notes.</div></div></div>
    <div class="card mb"><form onsubmit="submitMatch(event)">
      ${editing ? `<p class="mb"><span class="pill pending-pill">Editing a match</span></p>` : ''}
      <div class="row"><label class="field"><span>Date</span><input id="m-date" type="date" value="${E(em.date || today())}"></label><label class="field"><span>Type</span><select id="m-type">${['Competitive','Scrim','Quick Play','Custom','Tournament'].map(x => opt(x, em.type)).join('')}</select></label><label class="field"><span>Result</span><select id="m-result">${['Win','Loss','Draw'].map(x => opt(x, em.result)).join('')}</select></label></div>
      <div class="row"><label class="field"><span>Role</span><input id="m-role" value="${E(em.role || '')}" placeholder="Damage, Support, Tank..."></label><label class="field"><span>Map</span><input id="m-map" value="${E(em.map || '')}" placeholder="King's Row"></label><label class="field"><span>Heroes</span><input id="m-heroes" value="${E((em.heroes || []).join(', '))}" placeholder="Tracer, Cassidy"></label></div>
      <div class="row"><label class="field"><span>Rank before</span><input id="m-rankBefore" value="${E(em.rankBefore || '')}" placeholder="Diamond 3"></label><label class="field"><span>Rank after</span><input id="m-rankAfter" value="${E(em.rankAfter || '')}" placeholder="Diamond 2"></label><label class="field"><span>Replay code</span><input id="m-replayCode" value="${E(em.replayCode || '')}" placeholder="ABC123"></label></div>
      <label class="field"><span>Notes</span><textarea id="m-notes" placeholder="What happened, key mistakes, what to ask your coach about...">${E(em.notes || '')}</textarea></label>
      <button class="btn btn-primary">${editing ? 'Update match' : 'Save match'}</button>
      ${editing ? `<button type="button" class="btn btn-sm" onclick="cancelEditMatch()">Cancel</button>` : ''}
    </form></div>
    <div class="card"><div class="card-head"><h2>Match log</h2></div>${matchTable(matches().slice().reverse(), true)}</div>`;
}

function scenarioNames() {
  const c = client();
  const names = new Set();
  Object.keys(c.prs || {}).forEach(n => names.add(n));
  (c.clientKovaaksStats || []).forEach(s => s.scenario && names.add(s.scenario));
  playlists().forEach(p => (p.scenarios || []).forEach(sc => sc.name && names.add(sc.name)));
  return [...names].sort();
}

function renderKovaaks() {
  const c = client();
  const es = State.editStat || {};
  const editing = !!State.editStat;
  return `<div class="page-head"><div><h1>KovaaK's Stats</h1><div class="sub">Manual stat log for scores, accuracy, and notes. Your best scores update the coach dashboard.</div></div></div>
    <div class="card mb"><form onsubmit="submitKovaaks(event)">
      ${editing ? `<p class="mb"><span class="pill pending-pill">Editing a stat</span></p>` : ''}
      <div class="row"><label class="field"><span>Date</span><input id="k-date" type="date" value="${E(es.date || today())}"></label><label class="field"><span>Scenario</span><input id="k-scenario" list="scenario-options" value="${E(es.scenario || '')}" placeholder="Pasuing Voltaic Easy"><datalist id="scenario-options">${scenarioNames().map(n => `<option value="${E(n)}"></option>`).join('')}</datalist></label><label class="field"><span>Score</span><input id="k-score" type="number" step="any" value="${es.score == null ? '' : E(es.score)}" placeholder="12345"></label></div>
      <div class="row"><label class="field"><span>Accuracy %</span><input id="k-accuracy" type="number" step="any" value="${es.accuracy == null ? '' : E(es.accuracy)}" placeholder="optional"></label><label class="field"><span>Notes</span><input id="k-notes" value="${E(es.notes || '')}" placeholder="felt shaky, new sens, etc."></label></div>
      <button class="btn btn-primary">${editing ? "Update stat" : "Save KovaaK's stat"}</button>
      ${editing ? `<button type="button" class="btn btn-sm" onclick="cancelEditStat()">Cancel</button>` : ''}
    </form></div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Manual log</h2></div>${kovaaksTable((c.clientKovaaksStats || []).slice().reverse(), true)}</div>
      <div class="card"><div class="card-head"><h2>Current PRs</h2></div>${prsTable(c.prs || {}, c.prHistory || {})}</div>
    </div>`;
}

function renderHomework() {
  const rows = sessions().flatMap(session => (session.homework || []).map(homework => ({ session, homework }))).sort((a, b) => (a.homework.dueDate || '').localeCompare(b.homework.dueDate || ''));
  return `<div class="page-head"><div><h1>Homework</h1><div class="sub">Mark completed work and leave notes for your coach.</div></div></div>
    <div class="card">${rows.length ? rows.map(({ session, homework }) => homeworkRowHtml(session, homework)).join('') : '<div class="empty">No homework assigned yet.</div>'}</div>`;
}

function homeworkRowHtml(session, homework) {
  const noteId = `hw-note-${homework.id}`;
  return `<div class="list-row-block">
    <div><b style="${homework.done ? 'text-decoration:line-through;color:var(--dim)' : ''}">${E(homework.text)}</b><div class="muted">${E(homework.type)} ${homework.dueDate ? '- due ' + fmt(homework.dueDate) : '- assigned ' + fmt(session.date)}</div>${homework.clientNote ? `<div class="muted">Note: ${E(homework.clientNote)}</div>` : ''}</div>
    ${homework.done
      ? `<div class="mt"><button class="btn btn-sm" onclick="toggleHomework('${session.id}','${homework.id}',false)">Reopen</button></div>`
      : `<div class="row mt"><input id="${noteId}" placeholder="Optional note..."><button class="btn btn-sm btn-primary" onclick="toggleHomework('${session.id}','${homework.id}',true,'${noteId}')">Mark done</button></div>`}
  </div>`;
}

function renderSessions() {
  const rows = sessions().slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="page-head"><div><h1>Session Notes</h1><div class="sub">Recaps your coach wrote up after each session.</div></div></div>
    ${rows.length ? rows.map(s => `<div class="card mb">
      <div class="card-head"><h2>${s.topics ? E(s.topics) : 'Session'}</h2><span class="pill">${fmt(s.date)}</span></div>
      ${s.notes ? `<p class="mb" style="white-space:pre-wrap">${E(s.notes)}</p>` : '<p class="muted mb">No written recap for this session.</p>'}
      ${(s.homework || []).length ? `<h2 class="mb">Homework from this session</h2>${s.homework.map(h => `<div class="list-row"><div><b style="${h.done ? 'text-decoration:line-through;color:var(--dim)' : ''}">${E(h.text)}</b><div class="muted">${E(h.type)}${h.dueDate ? ' - due ' + fmt(h.dueDate) : ''}</div></div><span class="pill" style="${h.done ? '' : 'color:var(--warn);border-color:var(--warn)'}">${h.done ? 'Done' : 'Open'}</span></div>`).join('')}` : ''}
    </div>`).join('') : '<div class="empty">No session notes yet.</div>'}`;
}

function renderPlans() {
  return `<div class="page-head"><div><h1>Development Plan</h1><div class="sub">Your outcomes and weekly prescriptions from the coaching plan.</div></div></div>
    ${plans().length ? plans().map(plan => `<div class="card mb">
      <div class="card-head"><h2>${E(plan.title)}</h2><span class="pill">${E(plan.status)}</span></div>
      <p class="muted mb">${E(plan.objective || '')}</p>
      <div class="grid cols-2">
        <div><h2 class="mb">Outcomes</h2>${(plan.goals || []).length ? plan.goals.map(goal => goalHtml(plan, goal)).join('') : '<div class="empty">No outcomes yet.</div>'}</div>
        <div><h2 class="mb">Weekly prescriptions</h2>${(plan.actions || []).length ? plan.actions.map(action => actionRowHtml(plan, action)).join('') : '<div class="empty">No prescriptions yet.</div>'}</div>
      </div>
    </div>`).join('') : '<div class="empty">No development plan assigned yet.</div>'}`;
}

function renderPlaylists() {
  return `<div class="page-head"><div><h1>KovaaK's Playlists</h1><div class="sub">Assigned routines and scenario notes from your coach.</div></div></div>
    <div class="grid cols-2">${playlists().length ? playlists().map(p => `<div class="card"><div class="card-head"><h2>${E(p.name)}</h2><span class="pill">${(p.scenarios || []).length} scenarios</span></div>${p.notes ? `<p class="muted mb">${E(p.notes)}</p>` : ''}<table class="data"><thead><tr><th>Scenario</th><th>Reps</th></tr></thead><tbody>${(p.scenarios || []).map(s => `<tr><td><b>${E(s.name)}</b>${s.notes ? `<div class="muted">${E(s.notes)}</div>` : ''}</td><td>${E(s.reps || '')}</td></tr>`).join('')}</tbody></table></div>`).join('') : '<div class="empty">No playlists assigned yet.</div>'}</div>`;
}

function renderVods() {
  const reviews = vods().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return `<div class="page-head"><div><h1>VOD Reviews</h1><div class="sub">Coach review notes, drawings, screenshots, GIFs, and clips sent to you.</div></div></div>
    <div class="grid cols-2">${reviews.length ? reviews.map(vod => `<div class="card">
      <div class="card-head"><h2>${E(vod.title || 'VOD Review')}</h2><span class="pill">${isVodUnread(vod) ? 'Unread' : fmt(vod.date)}</span></div>
      ${vod.summary ? `<p class="muted mb">${E(vod.summary)}</p>` : ''}
      <div class="flex gap center mb">
        ${vod.url ? `<a class="btn btn-sm" href="${E(vod.url)}" target="_blank" rel="noopener noreferrer">Open source VOD</a>` : ''}
        ${isVodUnread(vod) ? `<button class="btn btn-sm btn-primary" onclick="markVodWatched('${vod.id}')">Mark watched</button>` : `<span class="muted small">Watched ${fmt(vod.clientViewedAt || vod.date)}</span>`}
      </div>
      ${(vod.notes || []).length ? (vod.notes || []).map(note => `<div class="marker">
        <div class="flex between center gap"><b>${fmtVodTime(note.t)}</b><span class="pill">${E(note.tag || 'Review')}${note.severity ? ' - ' + E(note.severity) : ''}</span></div>
        <p class="mt">${E(note.text || note.title || '')}</p>
        ${note.sourceUrl ? `<p><a href="${E(note.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open timestamp</a></p>` : ''}
        ${note.homework ? `<div class="notice"><b>Homework:</b> ${E(note.homework)}${note.homeworkDue ? `<div class="muted">Due ${fmt(note.homeworkDue)}</div>` : ''}</div>` : ''}
        ${note.clientPrompt ? `<p class="muted"><b>Coach asks:</b> ${E(note.clientPrompt)}</p>` : ''}
        ${(note.clientReplies || []).length ? `<div class="reply"><b>Your replies</b>${note.clientReplies.map(reply => `<div class="muted">${E(reply.text || '')}</div>`).join('')}</div>` : ''}
        <div class="row"><input id="reply-${vod.id}-${note.id}" placeholder="Reply to this moment..."><button class="btn btn-sm" onclick="replyVod('${vod.id}','${note.id}')">Send reply</button></div>
        ${note.imageDataUrl ? `<img src="${note.imageDataUrl}" alt="Review screenshot">` : ''}
        ${note.gifDataUrl ? `<img src="${note.gifDataUrl}" alt="Review GIF">` : ''}
        ${note.clipDataUrl ? `<video src="${note.clipDataUrl}" controls></video>` : ''}
      </div>`).join('') : '<div class="empty">No timestamp notes in this review.</div>'}
    </div>`).join('') : '<div class="empty">No VOD reviews sent yet.</div>'}</div>`;
}

function rowActions(id, kind, source) {
  if (source !== 'client-app') return '<span class="muted small">coach</span>';
  return `<button class="btn btn-sm" onclick="edit${kind}('${id}')">Edit</button> <button class="btn btn-sm" onclick="delete${kind}('${id}')">Del</button>`;
}
function matchTable(rows, editable) {
  if (!rows.length) return '<div class="empty">No matches logged yet.</div>';
  return `<table class="data"><thead><tr><th>Date</th><th>Result</th><th>Map</th><th>Heroes</th><th>Notes</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(m => `<tr><td class="muted">${fmt(m.date)}</td><td class="${m.result === 'Win' ? 'good' : m.result === 'Loss' ? 'bad' : 'muted'}"><b>${E(m.result)}</b></td><td>${E(m.map || '-')}</td><td>${E((m.heroes || []).join(', ') || '-')}</td><td class="muted">${E(m.notes || '')}</td>${editable ? `<td class="nowrap">${rowActions(m.id, 'Match', m.source)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}
function kovaaksTable(rows, editable) {
  if (!rows.length) return "<div class=\"empty\">No KovaaK's stats logged yet.</div>";
  return `<table class="data"><thead><tr><th>Date</th><th>Scenario</th><th>Score</th><th>Accuracy</th><th>Notes</th>${editable ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(s => `<tr><td class="muted">${fmt(s.date)}</td><td><b>${E(s.scenario)}</b></td><td class="accent"><b>${E(s.score)}</b></td><td>${s.accuracy == null ? '-' : E(s.accuracy) + '%'}</td><td class="muted">${E(s.notes || '')}</td>${editable ? `<td class="nowrap">${rowActions(s.id, 'Stat', s.source)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
}
function prsTable(prs, prHistory) {
  const rows = Object.entries(prs).sort((a, b) => Number(b[1].pr || 0) - Number(a[1].pr || 0));
  if (!rows.length) return '<div class="empty">No PRs yet.</div>';
  return `<table class="data"><thead><tr><th>Scenario</th><th>PR</th><th>Trend</th><th>Last</th></tr></thead><tbody>${rows.map(([name, pr]) => {
    const hist = ((prHistory && prHistory[name]) || []).map(h => ({ date: h.d, value: h.pr }));
    return `<tr><td>${E(name)}</td><td class="accent"><b>${E(pr.pr)}</b></td><td>${sparklineSvg(hist)}</td><td class="muted">${fmt(pr.lastDate)}</td></tr>`;
  }).join('')}</tbody></table>`;
}
function fmtVodTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function goalHtml(plan, goal) {
  const history = (goal.history || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const recent = history.slice(-3).reverse();
  const valId = `goal-val-${goal.id}`, noteId = `goal-note-${goal.id}`;
  return `<div class="list-row-block">
    <div class="split">
      <div><b>${E(goal.title)}</b><div class="muted">Current ${E(goal.current)}${E(goal.unit || '')} / target ${E(goal.target)}${E(goal.unit || '')}</div></div>
      ${sparklineSvg(history.map(h => ({ date: h.date, value: h.value })))}
    </div>
    <div class="row mt"><input id="${valId}" type="number" step="any" placeholder="New value"><input id="${noteId}" placeholder="Optional note/evidence..."><button class="btn btn-sm" onclick="goalCheckIn('${plan.id}','${goal.id}','${valId}','${noteId}')">Check in</button></div>
    ${recent.length ? `<div class="muted small mt">${recent.map(h => `${fmt(h.date)}: ${E(h.value)}${E(goal.unit || '')}${h.note ? ' - ' + E(h.note) : ''}`).join('<br>')}</div>` : ''}
  </div>`;
}
function actionRowHtml(plan, action) {
  const weekCount = (action.completions || []).filter(c => c.date >= weekStart()).length;
  const todayCount = (action.completions || []).filter(c => c.date === today()).length;
  const noteId = `act-note-${action.id}`;
  // The button stays enabled all day — a client who does an assigned routine
  // more than once in a day can log each rep, and they all count toward the
  // weekly target.
  return `<div class="list-row-block">
    <div><b>${E(action.title)}</b><div class="muted">${E(action.type)} - ${weekCount}/${action.targetPerWeek || 1} this week${todayCount ? ` - logged ${todayCount}x today` : ''}</div></div>
    <div class="row mt"><input id="${noteId}" placeholder="Optional note..."><button class="btn btn-sm btn-primary" onclick="completeAction('${plan.id}','${action.id}','${noteId}')">+ Done</button></div>
  </div>`;
}
function weekStart() {
  const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

// Sends this change plus anything queued from earlier failures in one request.
// On network failure the change is persisted to the offline queue and retried
// later (on reconnect, next boot, or the next successful sync) rather than lost.
async function syncChanges(changes, success) {
  if (State.busy) return;
  State.busy = true;
  const queued = loadQueue();
  try {
    const result = await window.clientApi.workspacePut(State.code, { changes: mergeChanges([...queued, changes]) });
    State.data = result.data;
    saveQueue([]);
    toast(success, 'good');
    renderShell();
  } catch (e) {
    saveQueue([...queued, changes]);
    toast('Saved offline - will sync when you reconnect.', '');
    renderShell();
  } finally {
    State.busy = false;
  }
}

// Best-effort flush of any queued offline changes. Silent when nothing is
// pending or the network is still down.
async function flushQueue(silent) {
  if (State.busy) return;
  const queued = loadQueue();
  if (!queued.length || !State.code) return;
  State.busy = true;
  try {
    const result = await window.clientApi.workspacePut(State.code, { changes: mergeChanges(queued) });
    State.data = result.data;
    saveQueue([]);
    if (!silent) toast(`Synced ${queued.length} offline change${queued.length === 1 ? '' : 's'}.`, 'good');
    renderShell();
  } catch (e) {
    // Still offline — leave the queue in place for the next attempt.
  } finally {
    State.busy = false;
  }
}

function submitMatch(event) {
  event.preventDefault();
  const val = id => document.getElementById(id).value.trim();
  const editing = !!State.editMatch;
  const id = editing ? State.editMatch.id : uid();
  State.editMatch = null;
  return syncChanges({ matches: [{
    id, date: val('m-date') || today(), type: val('m-type'), result: val('m-result'),
    role: val('m-role'), map: val('m-map'), heroes: val('m-heroes').split(',').map(x => x.trim()).filter(Boolean),
    rankBefore: val('m-rankBefore'), rankAfter: val('m-rankAfter'), replayCode: val('m-replayCode'), notes: val('m-notes')
  }] }, editing ? 'Match updated.' : 'Match synced to your coach.');
}
function editMatch(id) {
  State.editMatch = matches().find(m => m.id === id) || null;
  State.view = 'matches';
  renderShell();
  window.scrollTo(0, 0);
}
function cancelEditMatch() { State.editMatch = null; renderShell(); }
function deleteMatch(id) {
  if (!confirm('Delete this match? This cannot be undone.')) return;
  if (State.editMatch && State.editMatch.id === id) State.editMatch = null;
  return syncChanges({ deleteMatches: [id] }, 'Match deleted.');
}

function submitKovaaks(event) {
  event.preventDefault();
  const val = id => document.getElementById(id).value.trim();
  if (!val('k-scenario') || !val('k-score')) return toast('Scenario and score are required.', 'bad');
  const editing = State.editStat;
  // An edit is sent as delete-old + add-new so the backend recomputes the PR
  // from scratch (the plain add path only ever raises a PR, never corrects it).
  const changes = { kovaaksStats: [{ id: uid(), date: val('k-date') || today(), scenario: val('k-scenario'), score: val('k-score'), accuracy: val('k-accuracy'), notes: val('k-notes') }] };
  if (editing) changes.deleteKovaaksStats = [editing.id];
  State.editStat = null;
  return syncChanges(changes, editing ? "Stat updated." : "KovaaK's stat synced to your coach.");
}
function editStat(id) {
  State.editStat = (client().clientKovaaksStats || []).find(s => s.id === id) || null;
  State.view = 'kovaaks';
  renderShell();
  window.scrollTo(0, 0);
}
function cancelEditStat() { State.editStat = null; renderShell(); }
function deleteStat(id) {
  if (!confirm('Delete this stat? If it was a personal record, your PR will be recalculated.')) return;
  if (State.editStat && State.editStat.id === id) State.editStat = null;
  return syncChanges({ deleteKovaaksStats: [id] }, 'Stat deleted.');
}
function toggleHomework(sessionId, homeworkId, done, noteId) {
  const note = done && noteId ? (document.getElementById(noteId)?.value.trim() || '') : '';
  return syncChanges({ homework: [{ sessionId, homeworkId, done, note }] }, done ? 'Homework marked done.' : 'Homework reopened.');
}
function completeAction(planId, actionId, noteId) {
  const note = noteId ? (document.getElementById(noteId)?.value.trim() || '') : '';
  return syncChanges({ actionCompletions: [{ planId, actionId, date: today(), note }] }, 'Prescription completion synced.');
}
function goalCheckIn(planId, goalId, valId, noteId) {
  const value = document.getElementById(valId)?.value.trim();
  if (!value) return toast('Enter a value first.', 'bad');
  const note = document.getElementById(noteId)?.value.trim() || '';
  return syncChanges({ goalCheckIns: [{ planId, goalId, date: today(), value, note }] }, 'Outcome check-in synced.');
}
function markVodWatched(vodId) {
  return syncChanges({ vodWatched: [{ vodId }] }, 'Review marked watched.');
}
function replyVod(vodId, noteId) {
  const input = document.getElementById(`reply-${vodId}-${noteId}`);
  const text = input?.value.trim() || '';
  if (!text) return toast('Write a reply first.', 'bad');
  return syncChanges({ vodReplies: [{ vodId, noteId, text }] }, 'Reply sent to your coach.');
}
async function syncPull() {
  try {
    const result = await window.clientApi.workspaceGet(State.code);
    State.data = result.data;
    toast('Refreshed from coaching workspace.', 'good');
    renderShell();
  } catch (e) { toast(e.message || 'Refresh failed.', 'bad'); }
}
async function logout() {
  await flushQueue(true);
  // Clear per-device state so a different client code doesn't inherit this
  // one's queued changes or "since last visit" baseline.
  saveQueue([]);
  lsSet(SEEN_KEY, null);
  State.code = '';
  State.data = null;
  State.since = null;
  await window.clientApi.cacheSet({});
  renderLogin();
}

window.addEventListener('online', () => flushQueue());
window.addEventListener('DOMContentLoaded', boot);
