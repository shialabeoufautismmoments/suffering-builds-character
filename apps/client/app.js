const State = { code: '', data: null, view: 'today', busy: false };
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

async function boot() {
  const cache = await window.clientApi.cacheGet();
  State.code = cache.lastCode || '';
  State.data = cache.workspace || null;
  if (State.data && State.code) renderShell();
  else renderLogin();
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
    renderShell();
  } catch (e) {
    renderLogin(e.message || 'Could not unlock this client.');
  }
}

function nav(view) { State.view = view; renderShell(); }
function client() { return State.data && State.data.client || {}; }
function matches() { return State.data && State.data.matches || []; }
function sessions() { return State.data && State.data.sessions || []; }
function plans() { return State.data && State.data.developmentPlans || []; }
function playlists() { return State.data && State.data.playlists || []; }
function vods() { return State.data && State.data.vods || []; }
function isVodUnread(vod) { return vod && vod.clientStatus !== 'watched' && !vod.clientViewedAt; }
function unreadVods() { return vods().filter(isVodUnread); }

function renderShell() {
  const c = client();
  const tabs = [['today', 'Today'], ['dashboard', 'Overview'], ['matches', 'Matches'], ['kovaaks', "KovaaK's"], ['homework', 'Homework'], ['plans', 'Plan'], ['playlists', 'Playlists'], ['vods', `Reviews${unreadVods().length ? ` (${unreadVods().length})` : ''}`]];
  app.innerHTML = `<div class="shell">
    <div class="topbar">
      <div class="brand"><span class="dot"></span>CoachSBC Client</div>
      <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${State.view === id ? 'on' : ''}" onclick="nav('${id}')">${label}</button>`).join('')}</div>
      <div class="spacer"></div>
      <div class="client-badge">${E(c.name || 'Client')} ${c.rank ? '- ' + E(c.rank) : ''}</div>
      <button class="btn btn-sm" onclick="syncPull()">Refresh</button>
      <button class="btn btn-sm" onclick="logout()">Lock</button>
    </div>
    <main class="main">${renderView()}</main>
  </div>`;
}

function renderView() {
  if (State.view === 'today') return renderToday();
  if (State.view === 'matches') return renderMatches();
  if (State.view === 'kovaaks') return renderKovaaks();
  if (State.view === 'homework') return renderHomework();
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
      <div class="stat"><div class="label">Current streak</div><div class="value ${streak > 0 ? 'accent' : ''}">${streak}</div><div class="muted">day${streak === 1 ? '' : 's'}${activeToday ? '' : ' - not logged today yet'}</div></div>
      <div class="stat"><div class="label">Due today</div><div class="value ${dueOrOverdue.length ? 'warn' : 'good'}">${dueOrOverdue.length}</div><div class="muted">homework item${dueOrOverdue.length === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="label">Prescriptions on pace</div><div class="value">${prescriptions.filter(p => p.onPace).length}/${prescriptions.length}</div><div class="muted">this week</div></div>
    </div>
    ${activePlan ? `<div class="card mb">
      <div class="card-head"><h2>Today's prescriptions</h2><span class="pill">${E(activePlan.title)}</span></div>
      ${prescriptions.length ? prescriptions.map(({ action, weekCount, doneToday }) => `<div class="list-row">
        <div><b>${E(action.title)}</b><div class="muted">${E(action.type)} - ${weekCount}/${action.targetPerWeek || 1} this week${doneToday ? ' - done today' : ''}</div></div>
        <button class="btn btn-sm ${doneToday ? '' : 'btn-primary'}" ${doneToday ? 'disabled' : ''} onclick="completeAction('${activePlan.id}','${action.id}')">${doneToday ? 'Logged today' : '+ Done'}</button>
      </div>`).join('') : '<div class="empty">No weekly prescriptions assigned.</div>'}
    </div>` : ''}
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Homework due</h2><button class="btn btn-sm" onclick="nav('homework')">View all</button></div>
        ${dueHomework.length ? dueHomework.slice(0, 5).map(h => `<div class="list-row">
          <div><b>${E(h.text)}</b><div class="muted">${h.dueDate ? 'Due ' + fmt(h.dueDate) : 'No due date'}</div></div>
          <button class="btn btn-sm btn-primary" onclick="toggleHomework('${h.session.id}','${h.id}',true)">Mark done</button>
        </div>`).join('') : '<div class="empty">Nothing due. Nice.</div>'}
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
  return `<div class="page-head"><div><h1>Match Tracker</h1><div class="sub">Manually enter ranked games, scrims, replay codes, heroes, and notes.</div></div></div>
    <div class="card mb"><form onsubmit="submitMatch(event)">
      <div class="row"><label class="field"><span>Date</span><input id="m-date" type="date" value="${today()}"></label><label class="field"><span>Type</span><select id="m-type">${['Competitive','Scrim','Quick Play','Custom','Tournament'].map(x => `<option>${x}</option>`).join('')}</select></label><label class="field"><span>Result</span><select id="m-result">${['Win','Loss','Draw'].map(x => `<option>${x}</option>`).join('')}</select></label></div>
      <div class="row"><label class="field"><span>Role</span><input id="m-role" placeholder="Damage, Support, Tank..."></label><label class="field"><span>Map</span><input id="m-map" placeholder="King's Row"></label><label class="field"><span>Heroes</span><input id="m-heroes" placeholder="Tracer, Cassidy"></label></div>
      <div class="row"><label class="field"><span>Rank before</span><input id="m-rankBefore" placeholder="Diamond 3"></label><label class="field"><span>Rank after</span><input id="m-rankAfter" placeholder="Diamond 2"></label><label class="field"><span>Replay code</span><input id="m-replayCode" placeholder="ABC123"></label></div>
      <label class="field"><span>Notes</span><textarea id="m-notes" placeholder="What happened, key mistakes, what to ask your coach about..."></textarea></label>
      <button class="btn btn-primary">Save match</button>
    </form></div>
    <div class="card"><div class="card-head"><h2>Match log</h2></div>${matchTable(matches().slice().reverse())}</div>`;
}

function renderKovaaks() {
  const c = client();
  return `<div class="page-head"><div><h1>KovaaK's Stats</h1><div class="sub">Manual stat log for scores, accuracy, and notes. Your best scores update the coach dashboard.</div></div></div>
    <div class="card mb"><form onsubmit="submitKovaaks(event)">
      <div class="row"><label class="field"><span>Date</span><input id="k-date" type="date" value="${today()}"></label><label class="field"><span>Scenario</span><input id="k-scenario" placeholder="Pasuing Voltaic Easy"></label><label class="field"><span>Score</span><input id="k-score" type="number" step="any" placeholder="12345"></label></div>
      <div class="row"><label class="field"><span>Accuracy %</span><input id="k-accuracy" type="number" step="any" placeholder="optional"></label><label class="field"><span>Notes</span><input id="k-notes" placeholder="felt shaky, new sens, etc."></label></div>
      <button class="btn btn-primary">Save KovaaK's stat</button>
    </form></div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Manual log</h2></div>${kovaaksTable((c.clientKovaaksStats || []).slice().reverse())}</div>
      <div class="card"><div class="card-head"><h2>Current PRs</h2></div>${prsTable(c.prs || {})}</div>
    </div>`;
}

function renderHomework() {
  const rows = sessions().flatMap(session => (session.homework || []).map(homework => ({ session, homework }))).sort((a, b) => (a.homework.dueDate || '').localeCompare(b.homework.dueDate || ''));
  return `<div class="page-head"><div><h1>Homework</h1><div class="sub">Mark completed work and leave notes for your coach.</div></div></div>
    <div class="card">${rows.length ? rows.map(({ session, homework }) => `<div class="list-row">
      <div><b style="${homework.done ? 'text-decoration:line-through;color:var(--dim)' : ''}">${E(homework.text)}</b><div class="muted">${E(homework.type)} ${homework.dueDate ? '- due ' + fmt(homework.dueDate) : '- assigned ' + fmt(session.date)}</div>${homework.clientNote ? `<div class="muted">Note: ${E(homework.clientNote)}</div>` : ''}</div>
      <div><button class="btn btn-sm ${homework.done ? '' : 'btn-primary'}" onclick="toggleHomework('${session.id}','${homework.id}',${homework.done ? 'false' : 'true'})">${homework.done ? 'Reopen' : 'Mark done'}</button></div>
    </div>`).join('') : '<div class="empty">No homework assigned yet.</div>'}</div>`;
}

function renderPlans() {
  return `<div class="page-head"><div><h1>Development Plan</h1><div class="sub">Your outcomes and weekly prescriptions from the coaching plan.</div></div></div>
    ${plans().length ? plans().map(plan => `<div class="card mb">
      <div class="card-head"><h2>${E(plan.title)}</h2><span class="pill">${E(plan.status)}</span></div>
      <p class="muted mb">${E(plan.objective || '')}</p>
      <div class="grid cols-2">
        <div><h2 class="mb">Outcomes</h2>${(plan.goals || []).length ? plan.goals.map(goal => goalHtml(plan, goal)).join('') : '<div class="empty">No outcomes yet.</div>'}</div>
        <div><h2 class="mb">Weekly prescriptions</h2>${(plan.actions || []).length ? plan.actions.map(action => actionHtml(plan, action)).join('') : '<div class="empty">No prescriptions yet.</div>'}</div>
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

function matchTable(rows) {
  if (!rows.length) return '<div class="empty">No matches logged yet.</div>';
  return `<table class="data"><thead><tr><th>Date</th><th>Result</th><th>Map</th><th>Heroes</th><th>Notes</th></tr></thead><tbody>${rows.map(m => `<tr><td class="muted">${fmt(m.date)}</td><td class="${m.result === 'Win' ? 'good' : m.result === 'Loss' ? 'bad' : 'muted'}"><b>${E(m.result)}</b></td><td>${E(m.map || '-')}</td><td>${E((m.heroes || []).join(', ') || '-')}</td><td class="muted">${E(m.notes || '')}</td></tr>`).join('')}</tbody></table>`;
}
function kovaaksTable(rows) {
  if (!rows.length) return "<div class=\"empty\">No KovaaK's stats logged yet.</div>";
  return `<table class="data"><thead><tr><th>Date</th><th>Scenario</th><th>Score</th><th>Accuracy</th><th>Notes</th></tr></thead><tbody>${rows.map(s => `<tr><td class="muted">${fmt(s.date)}</td><td><b>${E(s.scenario)}</b></td><td class="accent"><b>${E(s.score)}</b></td><td>${s.accuracy == null ? '-' : E(s.accuracy) + '%'}</td><td class="muted">${E(s.notes || '')}</td></tr>`).join('')}</tbody></table>`;
}
function prsTable(prs) {
  const rows = Object.entries(prs).sort((a, b) => Number(b[1].pr || 0) - Number(a[1].pr || 0));
  if (!rows.length) return '<div class="empty">No PRs yet.</div>';
  return `<table class="data"><thead><tr><th>Scenario</th><th>PR</th><th>Last</th></tr></thead><tbody>${rows.map(([name, pr]) => `<tr><td>${E(name)}</td><td class="accent"><b>${E(pr.pr)}</b></td><td class="muted">${fmt(pr.lastDate)}</td></tr>`).join('')}</tbody></table>`;
}
function fmtVodTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function goalHtml(plan, goal) {
  return `<div class="list-row"><div><b>${E(goal.title)}</b><div class="muted">Current ${E(goal.current)}${E(goal.unit || '')} / target ${E(goal.target)}${E(goal.unit || '')}</div></div><button class="btn btn-sm" onclick="goalCheckIn('${plan.id}','${goal.id}')">Check in</button></div>`;
}
function actionHtml(plan, action) {
  const weekCount = (action.completions || []).filter(c => c.date >= weekStart()).length;
  return `<div class="list-row"><div><b>${E(action.title)}</b><div class="muted">${E(action.type)} - ${weekCount}/${action.targetPerWeek || 1} this week</div></div><button class="btn btn-sm btn-primary" onclick="completeAction('${plan.id}','${action.id}')">+ Done</button></div>`;
}
function weekStart() {
  const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

async function syncChanges(changes, success) {
  if (State.busy) return;
  State.busy = true;
  try {
    const result = await window.clientApi.workspacePut(State.code, { changes });
    State.data = result.data;
    toast(success, 'good');
    renderShell();
  } catch (e) {
    toast(e.message || 'Sync failed.', 'bad');
  } finally {
    State.busy = false;
  }
}

function submitMatch(event) {
  event.preventDefault();
  const val = id => document.getElementById(id).value.trim();
  return syncChanges({ matches: [{
    id: uid(), date: val('m-date') || today(), type: val('m-type'), result: val('m-result'),
    role: val('m-role'), map: val('m-map'), heroes: val('m-heroes').split(',').map(x => x.trim()).filter(Boolean),
    rankBefore: val('m-rankBefore'), rankAfter: val('m-rankAfter'), replayCode: val('m-replayCode'), notes: val('m-notes')
  }] }, 'Match synced to your coach.');
}
function submitKovaaks(event) {
  event.preventDefault();
  const val = id => document.getElementById(id).value.trim();
  if (!val('k-scenario') || !val('k-score')) return toast('Scenario and score are required.', 'bad');
  return syncChanges({ kovaaksStats: [{ id: uid(), date: val('k-date') || today(), scenario: val('k-scenario'), score: val('k-score'), accuracy: val('k-accuracy'), notes: val('k-notes') }] }, "KovaaK's stat synced to your coach.");
}
function toggleHomework(sessionId, homeworkId, done) {
  const note = done ? prompt('Optional note for your coach:', '') || '' : '';
  return syncChanges({ homework: [{ sessionId, homeworkId, done, note }] }, done ? 'Homework marked done.' : 'Homework reopened.');
}
function completeAction(planId, actionId) {
  const note = prompt('Optional note for your coach:', '') || '';
  return syncChanges({ actionCompletions: [{ planId, actionId, date: today(), note }] }, 'Prescription completion synced.');
}
function goalCheckIn(planId, goalId) {
  const value = prompt('Current value:');
  if (value == null || value.trim() === '') return;
  const note = prompt('Optional note/evidence:', '') || '';
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
  State.code = '';
  State.data = null;
  await window.clientApi.cacheSet({});
  renderLogin();
}

window.addEventListener('DOMContentLoaded', boot);
