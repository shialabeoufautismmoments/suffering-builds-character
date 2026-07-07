/* =============================================================================
   CLIENTS -roster, profile editor, and the client Dashboard
   ============================================================================= */
const Clients = {};

const ROSTER_GROUPS = [{ k: 'none', label: 'None' }, { k: 'team', label: 'Team' }, { k: 'package', label: 'Package' }];

Clients.sessionsHad = function (c) { return (c.packages || []).reduce((s, p) => s + (+p.used || 0), 0); };
Clients.sessionsLeft = function (c) {
  return (typeof Business !== 'undefined') ? Business.clientRemaining(c)
    : (c.packages || []).reduce((s, p) => s + Math.max(0, (+p.total || 0) - (+p.used || 0)), 0);
};
Clients.avatarHtml = function (c, className = 'ava') {
  const src = UI.safeAvatar(c && c.avatar);
  return `<div class="${className}">${src ? `<img src="${src}" alt="">` : UI.initials(c && c.name)}</div>`;
};
Clients.generateCode = function () {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let body = '';
  for (let i = 0; i < 8; i++) body += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `SBC-${body.slice(0, 4)}-${body.slice(4)}`;
};
Clients.ensureCode = function () {
  const input = document.getElementById('c-clientCode');
  if (!input) return;
  let code = '';
  do { code = Clients.generateCode(); }
  while (DB.clients.some(c => String(c.clientCode || '').toUpperCase() === code));
  input.value = code;
};

Clients.cardHtml = function (c) {
  const isActive = c.id === DB.activeClientId;
  const pls = clientPlaylists(c.id).length;
  const vds = clientVods(c.id).length;
  const clientStats = (c.clientKovaaksStats || []).length;
  const priority = +c.priority || 0;
  const hasPkg = (c.packages || []).length;
  const had = Clients.sessionsHad(c), left = Clients.sessionsLeft(c);
  return `
    <div class="card client-card ${isActive ? 'active-client' : ''}" onclick="Clients.setActive('${c.id}')">
      ${Clients.avatarHtml(c)}
      <div class="flex between center">
        <h2>${UI.escape(c.name)}</h2>
        ${isActive ? '<span class="tag accent">ACTIVE</span>' : ''}
      </div>
      <div style="margin:.3rem 0 .6rem">
        ${priority ? `<span class="tag">P${priority}</span>` : ''}
        ${c.rank ? `<span class="tag">${UI.escape(c.rank)}</span>` : ''}
        ${c.team ? `<span class="tag">👥 ${UI.escape(c.team)}</span>` : ''}
        ${c.cm360 ? `<span class="tag">${UI.escape(c.cm360)} cm/360</span>` : ''}
        ${c.clientCode ? '<span class="tag accent">CLIENT APP</span>' : ''}
      </div>
      <div class="muted" style="font-size:.78rem">${pls} playlist${pls !== 1 ? 's' : ''} - ${vds} VOD${vds !== 1 ? 's' : ''}${clientStats ? ` - ${clientStats} client stat log${clientStats !== 1 ? 's' : ''}` : ''}</div>
      ${hasPkg ? `<div class="muted" style="font-size:.78rem">🎟 ${had} session${had !== 1 ? 's' : ''} had - <b style="color:${left ? 'var(--accent)' : 'var(--text-dim)'}">${left} left</b></div>` : ''}
      <div class="flex gap-sm mt-sm" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-ghost" onclick="Clients.edit('${c.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="Clients.remove('${c.id}')">Delete</button>
      </div>
    </div>`;
};

UI.renderers.clients = function (el) {
  const mode = Clients.boardMode || 'cards';
  const groupBy = Clients.groupBy || 'none';
  const body = !DB.clients.length
    ? UI.emptyState('🎯', 'No clients yet', 'Create your first player profile to start coaching.')
    : mode === 'board' ? Clients.leaderboardHtml()
    : groupBy === 'none' ? `<div class="grid cols-3">${DB.clients.map(Clients.cardHtml).join('')}</div>`
    : Clients.groupedCardsHtml(groupBy);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Clients</h1><div class="sub">Players you coach. Selecting one scopes every other tab to them.</div></div>
      <div class="flex gap-sm center">
        ${DB.clients.length > 1 ? `<div class="seg">
          <button class="${mode === 'cards' ? 'on' : ''}" onclick="Clients.setMode('cards')">Cards</button>
          <button class="${mode === 'board' ? 'on' : ''}" onclick="Clients.setMode('board')">Leaderboard</button>
        </div>` : ''}
        ${DB.clients.length > 1 && mode === 'cards' ? `<label class="flex center gap-sm" style="font-size:.8rem;color:var(--text-muted)">Group by
          <select onchange="Clients.setGroup(this.value)" style="width:auto">${ROSTER_GROUPS.map(g => `<option value="${g.k}" ${groupBy === g.k ? 'selected' : ''}>${g.label}</option>`).join('')}</select></label>` : ''}
        ${DB.clients.length > 1 && mode === 'board' ? `<button class="btn" onclick="Clients.weightsModal()" title="Configure the weighted Score column">Score weights</button>` : ''}
        <button class="btn btn-primary" onclick="Clients.edit()">+ New Client</button>
      </div>
    </div>
    ${body}`;
};

Clients.setMode = function (m) { Clients.boardMode = m; UI.refresh(); };
Clients.setGroup = function (g) { Clients.groupBy = g; UI.refresh(); };

// Grouping keys. "No team"/"No package" sort to the bottom.
Clients.teamOf = function (c) { return (c.team || '').trim() || 'No team'; };
Clients.packageOf = function (c) {
  const pkgs = c.packages || [];
  if (!pkgs.length) return 'No package';
  const active = pkgs.filter(p => (p.total || 0) - (p.used || 0) > 0);
  const pick = (active.length ? active : pkgs).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  return (pick.name || '').trim() || 'Package';
};

Clients.groupedCardsHtml = function (key) {
  const fn = key === 'team' ? Clients.teamOf : Clients.packageOf;
  const groups = {};
  DB.clients.forEach(c => { const g = fn(c); (groups[g] ||= []).push(c); });
  const names = Object.keys(groups).sort((a, b) => {
    const ae = a.startsWith('No '), be = b.startsWith('No ');
    if (ae !== be) return ae ? 1 : -1;
    return a.localeCompare(b);
  });
  return names.map((g, i) => `
    <div class="flex between center" style="margin:${i ? '1.4rem' : '.2rem'} 0 .6rem;padding-bottom:.4rem;border-bottom:1px solid var(--border-soft)">
      <h2 style="font-size:1rem">${UI.escape(g)}</h2>
      <span class="muted" style="font-size:.78rem">${groups[g].length} client${groups[g].length !== 1 ? 's' : ''}</span>
    </div>
    <div class="grid cols-3">${groups[g].map(Clients.cardHtml).join('')}</div>`).join('');
};

Clients.metrics = function (c) {
  const ms = clientMatches(c.id);
  const rec = Matches.record(ms);
  const sessions = clientSessions(c.id);
  const openHw = sessions.flatMap(s => s.homework || []).filter(h => !h.done).length;
  const topPR = Object.values(c.prs || {}).reduce((m, p) => Math.max(m, p.pr), -Infinity);
  const dates = [];
  ms.forEach(m => dates.push((m.date || '').slice(0, 10)));
  sessions.forEach(s => dates.push((s.date || '').slice(0, 10)));
  clientVods(c.id).forEach(v => dates.push((v.date || '').slice(0, 10)));
  Object.keys(c.activity || {}).forEach(d => dates.push(d.replace(/\./g, '-')));
  const lastActive = dates.filter(Boolean).sort().pop() || '';
  return { rec, sessions: sessions.length, openHw, topPR: isFinite(topPR) ? topPR : null, lastActive,
    had: Clients.sessionsHad(c), remaining: Clients.sessionsLeft(c), priority: +c.priority || 0 };
};

Clients.sortKey = 'winrate';
Clients.sortDir = -1;
Clients.sortBy = function (key) {
  if (Clients.sortKey === key) Clients.sortDir *= -1;
  else { Clients.sortKey = key; Clients.sortDir = (key === 'name' || key === 'team' || key === 'package' || key === 'rank') ? 1 : -1; }
  UI.refresh();
};

// Metrics that can be weighted into the sortable Score.
const SCORE_METRICS = [['winrate', 'Win rate'], ['matches', 'Matches played'], ['had', 'Sessions done'], ['remaining', 'Sessions remaining'], ['openHw', 'Open homework'], ['priority', 'Priority']];

Clients.scoredRows = function () {
  const rows = DB.clients.map(c => ({ c, m: Clients.metrics(c) }));
  const W = Object.assign({}, ...SCORE_METRICS.map(([k]) => ({ [k]: 0 })), (DB.settings || {}).scoreWeights || {});
  const raw = ({ m }) => ({ winrate: m.rec.total ? m.rec.winrate : 0, matches: m.rec.total, had: m.had, remaining: m.remaining, openHw: m.openHw, priority: m.priority });
  const raws = rows.map(raw);
  const keys = SCORE_METRICS.map(([k]) => k);
  const rng = {}; keys.forEach(k => { const vs = raws.map(r => r[k]); rng[k] = { mn: Math.min(0, ...vs), mx: Math.max(0, ...vs) }; });
  const nrm = (k, v) => { const { mn, mx } = rng[k]; return mx > mn ? (v - mn) / (mx - mn) : 0; };
  const rawScore = raws.map(r => keys.reduce((s, k) => s + (W[k] || 0) * nrm(k, r[k]), 0));
  const smn = Math.min(0, ...rawScore), smx = Math.max(0, ...rawScore);
  rows.forEach((row, i) => { row.score = smx > smn ? Math.round((rawScore[i] - smn) / (smx - smn) * 100) : 0; });
  return rows;
};

Clients.leaderboardHtml = function () {
  const rows = Clients.scoredRows();
  const key = Clients.sortKey, dir = Clients.sortDir;
  const val = (row) => ({
    name: (row.c.name || '').toLowerCase(), team: (row.c.team || '').toLowerCase(), package: Clients.packageOf(row.c).toLowerCase(),
    rank: (row.c.rank || '').toLowerCase(), priority: row.m.priority, score: row.score,
    winrate: row.m.rec.total ? row.m.rec.winrate : -1, remaining: row.m.remaining, had: row.m.had,
    openHw: row.m.openHw, lastActive: row.m.lastActive || '',
  }[key]);
  rows.sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });

  const arrow = k => Clients.sortKey === k ? (Clients.sortDir < 0 ? ' v' : ' ^') : '';
  const th = (label, k) => `<th onclick="Clients.sortBy('${k}')" style="cursor:pointer;user-select:none">${label}${arrow(k)}</th>`;
  return `<div class="card" style="overflow-x:auto"><table class="data">
    <thead><tr>${th('Client', 'name')}${th('Team', 'team')}${th('Package', 'package')}${th('Rank', 'rank')}${th('Priority', 'priority')}${th('Score', 'score')}${th('Win%', 'winrate')}<th>W-L-D</th>${th('Sessions H/L', 'remaining')}${th('Open HW', 'openHw')}${th('Last active', 'lastActive')}<th></th></tr></thead>
    <tbody>${rows.map((row) => {
      const c = row.c, m = row.m;
      const active = c.id === DB.activeClientId;
      const wcol = m.rec.total ? (m.rec.winrate >= 55 ? 'var(--good)' : m.rec.winrate >= 45 ? 'var(--warn)' : 'var(--bad)') : 'var(--text-dim)';
      const pk = Clients.packageOf(c);
      return `<tr style="${active ? 'background:var(--accent-soft)' : ''}">
        <td><b>${UI.escape(c.name)}</b>${active ? ' <span class="tag accent" style="padding:0 .4rem">ACTIVE</span>' : ''}</td>
        <td class="muted">${UI.escape(c.team || '-')}</td>
        <td class="muted">${pk === 'No package' ? '-' : UI.escape(pk)}</td>
        <td class="muted">${UI.escape(c.rank || '-')}</td>
        <td>${m.priority || '-'}</td>
        <td style="font-weight:700;color:var(--accent)">${row.score}</td>
        <td style="color:${wcol};font-weight:600">${m.rec.total ? m.rec.winrate + '%' : '-'}</td>
        <td>${m.rec.total ? `${m.rec.w}-${m.rec.l}-${m.rec.d}` : '-'}</td>
        <td>${m.had} / <b style="color:${m.remaining ? 'var(--accent)' : 'var(--text-dim)'}">${m.remaining}</b></td>
        <td style="color:${m.openHw ? 'var(--warn)' : 'var(--text-dim)'}">${m.openHw}</td>
        <td class="muted">${m.lastActive ? UI.fmtDate(m.lastActive) : '-'}</td>
        <td><button class="btn btn-xs" onclick="Clients.setActive('${c.id}');App.nav('dashboard')">Open</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
};

/* -- Weighted-score configuration ------------------------------------------- */
Clients.weightsModal = function () {
  const W = Object.assign({}, ...SCORE_METRICS.map(([k]) => ({ [k]: 0 })), (DB.settings || {}).scoreWeights || {});
  UI.modal(`
    <div class="modal-head"><h2>Score weights</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <p class="muted" style="font-size:.82rem">Set how much each metric counts toward the sortable <b>Score</b> column. Use negative weights to penalise (e.g. open homework). Each metric is normalised across your current roster, then blended into a 0-100 score.</p>
    ${SCORE_METRICS.map(([k, l]) => `<label class="field"><span>${l}</span><input id="w-${k}" type="number" step="0.5" value="${W[k]}"></label>`).join('')}
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Clients.saveWeights()">Save &amp; sort by score</button>
    </div>`);
};
Clients.saveWeights = function () {
  const W = {};
  SCORE_METRICS.forEach(([k]) => { W[k] = +document.getElementById('w-' + k).value || 0; });
  DB.settings ||= {}; DB.settings.scoreWeights = W; saveDB();
  Clients.boardMode = 'board'; Clients.sortKey = 'score'; Clients.sortDir = -1;
  UI.closeModal();
  UI.toast('Score weights saved.', 'good');
  UI.refresh();
};

Clients.setActive = function (id) {
  DB.activeClientId = id;
  saveDB();
  UI.updateClientPill();
  UI.toast(`Active client: ${getClient(id).name}`, 'good');
  UI.refresh();
};
Clients.selectFromNav = function (id) {
  if (!getClient(id)) return;
  DB.activeClientId = id;
  saveDB();
  UI.updateClientPill();
  App.nav('dashboard');
};

Clients.edit = function (id) {
  const c = id ? getClient(id) : null;
  const f = (k, d = '') => UI.escape(c ? (c[k] ?? d) : d);
  Clients.pendingAvatar = UI.safeAvatar(c && c.avatar);
  Clients.pendingDiscordId = c && c.discordId || '';
  UI.modal(`
    <div class="modal-head"><h2>${c ? 'Edit Client' : 'New Client'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>Name</span><input id="c-name" value="${f('name')}" placeholder="Player name / gamertag"></label>
    <div class="row">
      <label class="field"><span>Assigned coach</span>
        <select id="c-coachId">${(DB.coaches || []).map(coach => `<option value="${coach.id}" ${coach.id === (c && c.coachId || Access.currentCoachId) ? 'selected' : ''}>${UI.escape(coach.name)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Game</span>
        <select id="c-game">
          ${['Overwatch 2', 'Valorant', 'Apex Legends', 'CS2', 'The Finals', 'Other'].map(g =>
            `<option ${c && c.game === g ? 'selected' : ''}>${g}</option>`).join('')}
        </select></label>
      <label class="field"><span>Rank / Division</span><input id="c-rank" value="${f('rank')}" placeholder="e.g. Diamond 3"></label>
    </div>
    <div class="row">
      <label class="field"><span>Team / Org (optional)</span><input id="c-team" value="${f('team')}" placeholder="e.g. Academy Squad, Team Alpha"></label>
      <label class="field"><span>Discord username / User ID</span><input id="c-discord" value="${f('discord')}" placeholder="username or numeric User ID"></label>
      <label class="field"><span>Priority (0-10)</span><input id="c-priority" type="number" min="0" max="10" step="1" value="${f('priority', 0)}" placeholder="0"></label>
    </div>
    <div class="discord-avatar-editor">
      <div class="discord-avatar-preview" id="discord-avatar-preview">${Clients.pendingAvatar ? `<img src="${Clients.pendingAvatar}" alt="">` : UI.initials(c && c.name)}</div>
      <div>
        <div class="flex gap-sm wrap">
          <button class="btn btn-sm" id="discord-avatar-fetch" onclick="Clients.lookupDiscordAvatar()">Grab Discord icon</button>
          <button class="btn btn-sm btn-ghost" id="discord-avatar-remove" onclick="Clients.removeDiscordAvatar()" ${Clients.pendingAvatar ? '' : 'style="display:none"'}>Remove</button>
        </div>
        <div class="discord-avatar-note">Avatar lookup requires a numeric Discord User ID (or copied user mention). The ID is sent to PfpFinder.com, and the returned Discord CDN image is saved locally with this client.</div>
      </div>
    </div>
    <div class="row">
      <label class="field"><span>Overwatch profile name</span><input id="c-owName" value="${f('owName')}" placeholder="BattleTag or profile name"></label>
      <label class="field"><span>BattleTag / platform</span><input id="c-owTag" value="${f('owTag')}" placeholder="PC, console, or #1234"></label>
      <label class="field"><span>Overwatch profile URL (optional)</span><input id="c-trackerUrl" value="${f('trackerUrl')}" placeholder="https://tracker.gg/overwatch/ or https://overbuff.com/players/..."></label>
    </div>
    <label class="field"><span>KovaaK's Steam ID (for web telemetry sync)</span><input id="c-steamId" value="${f('steamId')}" placeholder="7656119..."></label>
    <label class="field"><span>Client app access code</span>
      <div class="flex gap-sm">
        <input id="c-clientCode" value="${f('clientCode')}" placeholder="Generate a unique code for the client app">
        <button type="button" class="btn" onclick="Clients.ensureCode()">Generate</button>
      </div>
      <div class="muted" style="font-size:.74rem;margin-top:.25rem">Give this code to the client. Their app only returns this client's matches, KovaaK's logs, homework, playlists, and development plan.</div>
    </label>
    <div class="row">
      <label class="field"><span>DPI</span><input id="c-dpi" value="${f('dpi')}" placeholder="800"></label>
      <label class="field"><span>In-game Sens</span><input id="c-sens" value="${f('sens')}" placeholder="5.0"></label>
      <label class="field"><span>cm / 360</span><input id="c-cm360" value="${f('cm360')}" placeholder="auto / manual"></label>
    </div>
    <label class="field"><span>Coaching notes / goals (free text)</span><textarea id="c-notes" placeholder="Background, focus areas, weaknesses...">${f('notes')}</textarea></label>
    <label class="field"><span>Discord webhook URL (optional -enables one-click posting)</span><input id="c-webhook" value="${f('webhook')}" placeholder="https://discord.com/api/webhooks/..."></label>
    <label class="field"><span>Cal.com booking link override (optional -defaults to your global link)</span><input id="c-calLink" value="${f('calLink')}" placeholder="e.g. your-name/overwatch-coaching"></label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Clients.save('${id || ''}')">${c ? 'Save' : 'Create'}</button>
    </div>`);
};

Clients.save = function (id) {
  const get = k => document.getElementById('c-' + k).value.trim();
  const name = get('name');
  if (!name) { UI.toast('Name is required.', 'bad'); return; }
  const discord = get('discord');
  const discordIdMatch = /^(?:<@!?)?(\d{17,20})>?$/.exec(discord);
  const data = {
    coachId: get('coachId') || Access.currentCoachId,
    name, game: get('game'), rank: get('rank'), team: get('team'), priority: +get('priority') || 0,
    discord, discordId: Clients.pendingDiscordId || (discordIdMatch && discordIdMatch[1]) || '',
    avatar: UI.safeAvatar(Clients.pendingAvatar), webhook: get('webhook'), calLink: get('calLink'),
    owName: get('owName'), owTag: get('owTag'), trackerUrl: get('trackerUrl'),
    steamId: get('steamId'), dpi: get('dpi'), sens: get('sens'), cm360: get('cm360'), notes: get('notes'),
    clientCode: get('clientCode').toUpperCase(),
  };

  if (id) {
    Object.assign(getClient(id), data);
  } else {
    const c = { id: uid(), ...data, goals: [], developmentPlans: [], prs: {}, prHistory: {}, activity: {}, clientKovaaksStats: [], createdAt: new Date().toISOString() };
    DB.clients.push(c);
    if (!DB.activeClientId) DB.activeClientId = c.id;
  }
  saveDB();
  UI.closeModal();
  UI.updateClientPill();
  UI.toast('Client saved.', 'good');
  UI.refresh();
};

Clients.renderPendingAvatar = function () {
  const preview = document.getElementById('discord-avatar-preview');
  if (!preview) return;
  preview.replaceChildren();
  const src = UI.safeAvatar(Clients.pendingAvatar);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    preview.appendChild(img);
  } else {
    preview.textContent = UI.initials(document.getElementById('c-name')?.value || '?');
  }
  const remove = document.getElementById('discord-avatar-remove');
  if (remove) remove.style.display = src ? '' : 'none';
};
Clients.lookupDiscordAvatar = async function () {
  const input = document.getElementById('c-discord');
  const button = document.getElementById('discord-avatar-fetch');
  if (!input || !button) return false;
  const typed = input.value.trim();
  const identity = /^(?:<@!?)?\d{17,20}>?$/.test(typed) ? typed : (Clients.pendingDiscordId || typed);
  if (!identity) { UI.toast('Enter a numeric Discord User ID first.', 'bad'); return false; }
  button.disabled = true;
  button.textContent = 'Finding icon...';
  try {
    const result = await window.api.discordAvatarLookup(identity);
    if (!result || !result.success) {
      UI.toast(result && result.msg || 'Discord avatar lookup failed.', 'bad');
      return false;
    }
    Clients.pendingAvatar = UI.safeAvatar(result.avatarDataUrl);
    Clients.pendingDiscordId = result.userId || '';
    if (result.username) input.value = '@' + result.username;
    Clients.renderPendingAvatar();
    UI.toast('Discord icon added.', 'good');
    return true;
  } catch (e) {
    UI.toast('Discord avatar lookup is temporarily unavailable.', 'bad');
    return false;
  } finally {
    button.disabled = false;
    button.textContent = 'Grab Discord icon';
  }
};
Clients.removeDiscordAvatar = function () {
  Clients.pendingAvatar = '';
  Clients.pendingDiscordId = '';
  Clients.renderPendingAvatar();
};

Clients.remove = function (id) {
  const c = getClient(id);
  UI.confirm(`Delete "${c.name}" and all their playlists & VOD reviews? This cannot be undone.`, () => {
    DB.clients = DB.clients.filter(x => x.id !== id);
    DB.playlists = DB.playlists.filter(p => p.clientId !== id);
    DB.vods = DB.vods.filter(v => v.clientId !== id);
    DB.matches = DB.matches.filter(m => m.clientId !== id);
    DB.sessions = DB.sessions.filter(s => s.clientId !== id);
    DB.scheduled = DB.scheduled.filter(s => s.clientId !== id);
    DB.reminders = (DB.reminders || []).filter(r => r.clientId !== id);
    if (DB.activeClientId === id) DB.activeClientId = DB.clients[0]?.id || null;
    saveDB();
    UI.updateClientPill();
    UI.toast('Client deleted.');
    UI.refresh();
  });
};

/* -- Goals (managed from the Dashboard) ------------------------------------- */
Clients.addGoal = function () {
  const c = activeClient(); if (!c) return;
  const input = document.getElementById('goal-input');
  const text = input.value.trim();
  if (!text) return;
  (c.goals ||= []).push({ id: uid(), text, done: false, createdAt: new Date().toISOString() });
  input.value = '';
  saveDB();
  UI.refresh();
};
Clients.toggleGoal = function (i) {
  const c = activeClient(); if (!c) return;
  c.goals[i].done = !c.goals[i].done;
  saveDB();
  UI.refresh();
};
Clients.removeGoal = function (i) {
  const c = activeClient(); if (!c) return;
  c.goals.splice(i, 1);
  saveDB();
  UI.refresh();
};

/* -- Dashboard -------------------------------------------------------------- */
UI.renderers.dashboard = function (el) {
  if (UI.requireClient(el, 'Dashboard')) return;
  const c = activeClient();
  const pls = clientPlaylists(c.id);
  const vds = clientVods(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const prs = c.prs || {};
  const prEntries = Object.entries(prs).sort((a, b) => (b[1].lastDate || '').localeCompare(a[1].lastDate || ''));
  const goals = c.goals || [];

  const totalReps = pls.reduce((s, p) => s + p.scenarios.reduce((x, sc) => x + sc.reps, 0), 0);
  const activeDays = Object.keys(c.activity || {}).length;
  const matches = clientMatches(c.id);
  const rec = Matches.record(matches);
  const sessions = clientSessions(c.id);
  const openHw = sessions.flatMap(s => s.homework || []).filter(h => !h.done).length;
  const clientStats = (c.clientKovaaksStats || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
  const clientLoggedMatches = matches.filter(m => m.source === 'client-app').length;
  const recentMatches = matches.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
  const remaining = (typeof Business !== 'undefined') ? Business.clientRemaining(c) : 0;
  const nextSes = (typeof Business !== 'undefined') ? Business.nextSession(c.id) : null;
  const unpaidCount = (c.packages || []).filter(p => !p.paid).length;
  const trackerStats = c.trackerStats || null;

  el.innerHTML = `
    <div class="page-head">
      <div class="client-profile-head">${Clients.avatarHtml(c, 'client-avatar')}<div><h1>${UI.escape(c.name)}</h1>
        <div class="sub">${[c.game, c.rank, c.cm360 && c.cm360 + ' cm/360', c.discord && '💬 ' + c.discord].filter(Boolean).map(UI.escape).join(' - ') || 'No profile details'}</div></div>
      </div>
      <div class="flex gap-sm">
        ${(typeof Cal !== 'undefined' && Cal.configured()) ? `<button class="btn" onclick="Cal.embedModal('${c.id}')" title="Open this client's Cal.com booking page">📅 Booking</button>` : ''}
        <button class="btn" onclick="Clients.edit('${c.id}')">Edit Profile</button>
      </div>
    </div>

    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">${trackerStats ? 'Profile Snapshot Win Rate' : 'Match Win Rate'}</div><div class="value accent">${trackerStats && trackerStats.winRate != null ? trackerStats.winRate + '%' : rec.total ? rec.winrate + '%' : '-'}</div></div>
      <div class="stat-tile"><div class="label">${trackerStats ? 'Profile Games' : 'Matches (W-L-D)'}</div><div class="value" style="font-size:1.3rem">${trackerStats && trackerStats.matches != null ? trackerStats.matches : rec.total ? `${rec.w}-${rec.l}-${rec.d}` : '0'}</div></div>
      ${trackerStats && trackerStats.headshotPct != null ? `<div class="stat-tile"><div class="label">Profile Accuracy</div><div class="value">${trackerStats.headshotPct}%</div></div>` : ''}
      <div class="stat-tile"><div class="label">Playlists</div><div class="value">${pls.length}</div></div>
      <div class="stat-tile"><div class="label">VOD Reviews</div><div class="value">${vds.length}</div></div>
      <div class="stat-tile"><div class="label">Sessions</div><div class="value">${sessions.length}</div></div>
      <div class="stat-tile"><div class="label">Open Homework</div><div class="value" style="color:${openHw ? 'var(--warn)' : 'var(--good)'}">${openHw}</div></div>
      <div class="stat-tile"><div class="label">Client Logged</div><div class="value">${clientStats.length + clientLoggedMatches}</div></div>
    </div>

    ${typeof Tracker !== 'undefined' ? Tracker.dashboardHtml(c) : ''}

    ${typeof Plans !== 'undefined' ? Plans.dashboardHtml(c) : ''}

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Goals</h2></div>
        <div class="flex gap-sm mb">
          <input id="goal-input" placeholder="Add a coaching goal..." onkeydown="if(event.key==='Enter')Clients.addGoal()">
          <button class="btn btn-primary btn-sm" onclick="Clients.addGoal()">Add</button>
        </div>
        ${goals.length ? goals.map((g, i) => `
          <div class="flex between center" style="padding:.35rem 0;border-bottom:1px solid var(--border-soft)">
            <label class="flex center gap-sm" style="cursor:pointer">
              <input type="checkbox" style="width:auto" ${g.done ? 'checked' : ''} onchange="Clients.toggleGoal(${i})">
              <span style="${g.done ? 'text-decoration:line-through;color:var(--text-dim)' : ''}">${UI.escape(g.text)}</span>
            </label>
            <button class="btn btn-xs btn-ghost" onclick="Clients.removeGoal(${i})">&times;</button>
          </div>`).join('') : '<div class="muted" style="font-size:.82rem">No goals set.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Recent Personal Bests</h2>
          <button class="btn btn-sm btn-ghost" onclick="App.nav('telemetry')">Import stats</button></div>
        ${prEntries.length ? `<table class="data"><thead><tr><th>Scenario</th><th>PR</th><th>Plays</th><th>Last</th></tr></thead><tbody>
          ${prEntries.slice(0, 8).map(([n, p]) => `<tr><td>${UI.escape(n)}</td><td class="text-accent">${p.pr.toFixed(1)}</td><td>${p.plays}</td><td class="muted">${UI.fmtDate(p.lastDate)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="muted" style="font-size:.82rem">No telemetry imported yet. Go to the Telemetry tab to import this client\'s KovaaK\'s stats.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Client App Submissions</h2><span class="muted" style="font-size:.78rem">${c.clientCode ? 'Code ' + UI.escape(c.clientCode) : 'No code yet'}</span></div>
        ${clientStats.length ? `<table class="data"><thead><tr><th>Date</th><th>Scenario</th><th>Score</th><th>Notes</th></tr></thead><tbody>
          ${clientStats.map(s => `<tr><td class="muted">${UI.fmtDate(s.date)}</td><td><b>${UI.escape(s.scenario || '-')}</b></td><td class="text-accent">${UI.escape(s.score ?? '-')}</td><td class="muted">${UI.escape(s.notes || '')}</td></tr>`).join('')}
        </tbody></table>` : "<div class=\"muted\" style=\"font-size:.82rem\">No KovaaK's stats submitted through the client app yet.</div>"}
        ${clientLoggedMatches ? `<div class="muted mt-sm" style="font-size:.78rem">${clientLoggedMatches} match${clientLoggedMatches === 1 ? '' : 'es'} entered by the client. Open Match Log for details.</div>` : ''}
      </div>

      <div class="card">
        <div class="card-head"><h2>Assigned Playlists</h2>
          <button class="btn btn-sm btn-ghost" onclick="App.nav('playlists')">Manage</button></div>
        ${pls.length ? pls.map(p => `
          <div class="flex between center" style="padding:.4rem 0;border-bottom:1px solid var(--border-soft)">
            <div><b>${UI.escape(p.name)}</b> <span class="muted" style="font-size:.78rem">-${p.scenarios.length} scenarios</span></div>
            <button class="btn btn-xs" onclick="Playlists.loadToBuilder('${p.id}');App.nav('playlists')">Open</button>
          </div>`).join('') : '<div class="muted" style="font-size:.82rem">No playlists assigned.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Recent VOD Reviews</h2>
          <button class="btn btn-sm btn-ghost" onclick="App.nav('vods')">All VODs</button></div>
        ${vds.length ? vds.slice(0, 6).map(v => `
          <div class="flex between center" style="padding:.4rem 0;border-bottom:1px solid var(--border-soft)">
            <div><b>${UI.escape(v.title)}</b> <span class="muted" style="font-size:.78rem">-${v.notes.length} notes - ${UI.fmtDate(v.date)}</span></div>
            <button class="btn btn-xs" onclick="Vods.open('${v.id}')">Review</button>
          </div>`).join('') : '<div class="muted" style="font-size:.82rem">No VOD reviews yet.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Recent Matches</h2>
          <button class="btn btn-sm btn-ghost" onclick="App.nav('matches')">Match log</button></div>
        ${recentMatches.length ? recentMatches.map(m => `
          <div class="flex between center" style="padding:.4rem 0;border-bottom:1px solid var(--border-soft)">
            <div><b style="color:${{ Win: 'var(--good)', Loss: 'var(--bad)', Draw: 'var(--text-muted)' }[m.result]}">${m.result}</b>
              <span class="muted" style="font-size:.78rem">- ${UI.escape(m.map || '-')}${m.heroes && m.heroes.length ? ' - ' + UI.escape(m.heroes.join(', ')) : ''}</span></div>
            <span class="muted" style="font-size:.74rem">${UI.fmtDate(m.date)}</span>
          </div>`).join('') : '<div class="muted" style="font-size:.82rem">No matches logged yet.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Coaching</h2><button class="btn btn-sm btn-ghost" onclick="App.nav('business')">Finance</button></div>
        <div class="flex between center" style="padding:.4rem 0;border-bottom:1px solid var(--border-soft)">
          <span class="muted">Sessions remaining</span><b style="color:${remaining ? 'var(--accent)' : 'var(--text-dim)'}">${remaining}</b></div>
        <div class="flex between center" style="padding:.4rem 0;border-bottom:1px solid var(--border-soft)">
          <span class="muted">Next session</span><b>${nextSes ? UI.fmtDate(nextSes.date) + (nextSes.time ? ' - ' + UI.escape(nextSes.time) : '') : '-'}</b></div>
        ${unpaidCount ? `<div class="flex between center" style="padding:.4rem 0"><span class="muted">Unpaid packages</span><b class="text-bad">${unpaidCount}</b></div>` : ''}
      </div>
    </div>

    <div class="card mt">
      <div class="card-head"><h2>Activity Timeline</h2></div>
      ${Timeline.html(c.id, 14)}
    </div>`;
};



