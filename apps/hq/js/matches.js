/* =============================================================================
   MATCHES -Overwatch match/scrim tracker, per-hero & per-map analytics,
   and a reusable Map Playbook knowledge base.
   ============================================================================= */
const Matches = {};

const OW_MAPS = [
  // Control
  { name: 'Antarctic Peninsula', mode: 'Control' }, { name: 'Busan', mode: 'Control' },
  { name: 'Ilios', mode: 'Control' }, { name: 'Lijiang Tower', mode: 'Control' },
  { name: 'Nepal', mode: 'Control' }, { name: 'Oasis', mode: 'Control' }, { name: 'Samoa', mode: 'Control' },
  // Escort
  { name: 'Circuit Royal', mode: 'Escort' }, { name: 'Dorado', mode: 'Escort' },
  { name: 'Havana', mode: 'Escort' }, { name: 'Junkertown', mode: 'Escort' },
  { name: 'Rialto', mode: 'Escort' }, { name: 'Route 66', mode: 'Escort' },
  { name: 'Shambali Monastery', mode: 'Escort' }, { name: 'Watchpoint: Gibraltar', mode: 'Escort' },
  // Hybrid
  { name: 'Blizzard World', mode: 'Hybrid' }, { name: 'Eichenwalde', mode: 'Hybrid' },
  { name: 'Hollywood', mode: 'Hybrid' }, { name: "King's Row", mode: 'Hybrid' },
  { name: 'Midtown', mode: 'Hybrid' }, { name: 'Numbani', mode: 'Hybrid' }, { name: 'Paraiso', mode: 'Hybrid' },
  // Push
  { name: 'Colosseo', mode: 'Push' }, { name: 'Esperanca', mode: 'Push' },
  { name: 'New Queen Street', mode: 'Push' }, { name: 'Runasapi', mode: 'Push' },
  // Flashpoint
  { name: 'New Junk City', mode: 'Flashpoint' }, { name: 'Suravasa', mode: 'Flashpoint' },
  // Clash
  { name: 'Hanaoka', mode: 'Clash' }, { name: 'Throne of Anubis', mode: 'Clash' },
];
const MAP_MODE = Object.fromEntries(OW_MAPS.map(m => [m.name, m.mode]));
const RESULT_COLOR = { Win: 'var(--good)', Loss: 'var(--bad)', Draw: 'var(--text-muted)' };

Matches._formHeroes = [];

/* -- Analytics -------------------------------------------------------------- */
Matches.record = function (matches) {
  const w = matches.filter(m => m.result === 'Win').length;
  const l = matches.filter(m => m.result === 'Loss').length;
  const d = matches.filter(m => m.result === 'Draw').length;
  const decisive = w + l;
  return { w, l, d, total: matches.length, winrate: decisive ? Math.round((w / decisive) * 100) : 0 };
};

Matches.groupStats = function (matches, keyFn) {
  const groups = {};
  matches.forEach(m => {
    (keyFn(m) || []).forEach(k => {
      if (!k) return;
      (groups[k] ||= []).push(m);
    });
  });
  return Object.entries(groups).map(([k, ms]) => ({ key: k, ...Matches.record(ms) }))
    .sort((a, b) => b.total - a.total || b.winrate - a.winrate);
};

/* -- View ------------------------------------------------------------------- */
UI.renderers.matches = function (el) {
  if (UI.requireClient(el, 'Matches')) return;
  const c = activeClient();
  const ms = clientMatches(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  const rec = Matches.record(ms);
  const byHero = Matches.groupStats(ms, m => m.heroes);
  const byMap = Matches.groupStats(ms, m => [m.map]);
  const byRole = Matches.groupStats(ms, m => [m.role]);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Matches</h1><div class="sub">Overwatch match & scrim log for <b>${UI.escape(c.name)}</b>.</div></div>
      <div class="flex gap-sm">
        <button class="btn" onclick="Matches.playbook()">Map Playbook</button>
        <button class="btn btn-primary" onclick="Matches.edit()">+ Log Match</button>
      </div>
    </div>

    ${typeof Tracker !== 'undefined' ? Tracker.dashboardHtml(c) : ''}

    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">Matches</div><div class="value">${rec.total}</div></div>
      <div class="stat-tile"><div class="label">Win Rate</div><div class="value accent">${rec.total ? rec.winrate + '%' : '-'}</div></div>
      <div class="stat-tile"><div class="label">Record (W-L-D)</div><div class="value" style="font-size:1.3rem">${rec.w}-${rec.l}-${rec.d}</div></div>
      <div class="stat-tile"><div class="label">Maps Played</div><div class="value">${byMap.length}</div></div>
    </div>

    ${ms.length ? `
    <div class="grid cols-2 mb">
      <div class="card">
        <div class="card-head"><h2>By Hero</h2></div>
        ${Matches.statTable(byHero, 'Hero')}
      </div>
      <div class="card">
        <div class="card-head"><h2>By Map</h2></div>
        ${Matches.statTable(byMap, 'Map', m => MAP_MODE[m] || '')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Match Log</h2>${byRole.length > 1 ? `<span class="muted" style="font-size:.78rem">${byRole.map(r => `${r.key}: ${r.winrate}%`).join(' - ')}</span>` : ''}</div>
      <table class="data"><thead><tr><th>Date</th><th>Result</th><th>Map</th><th>Role</th><th>Heroes</th><th>Rank</th><th></th></tr></thead><tbody>
      ${ms.map(m => `<tr>
        <td class="muted">${UI.fmtDate(m.date)}${m.type && m.type !== 'Competitive' ? ` <span class="pill">${UI.escape(m.type)}</span>` : ''}${m.source === 'client-app' ? ' <span class="pill">CLIENT</span>' : ''}</td>
        <td style="color:${RESULT_COLOR[m.result]};font-weight:700">${m.result}</td>
        <td>${UI.escape(m.map || '-')}</td>
        <td>${UI.escape(m.role || '-')}</td>
        <td>${(m.heroes || []).map(UI.escape).join(', ') || '-'}</td>
        <td class="muted">${[m.rankBefore, m.rankAfter].filter(Boolean).map(UI.escape).join(' ->') || (m.sr ? UI.escape(String(m.sr)) : '-')}</td>
        <td style="white-space:nowrap"><button class="btn btn-xs btn-ghost" onclick="Matches.edit('${m.id}')">Edit</button> <button class="btn btn-xs btn-danger" onclick="Matches.remove('${m.id}')">x</button></td>
      </tr>${m.notes ? `<tr><td></td><td colspan="6" class="muted" style="font-size:.78rem;padding-top:0">${UI.escape(m.notes)}</td></tr>` : ''}`).join('')}
      </tbody></table>
    </div>`
    : UI.emptyState('-', 'No matches logged', 'Log this client\'s ranked games and scrims to track hero/map win rates.')}`;
};

Matches.statTable = function (rows, label, sub) {
  if (!rows.length) return '<div class="muted" style="font-size:.82rem">No data.</div>';
  return `<table class="data"><thead><tr><th>${label}</th><th>Games</th><th>W-L</th><th>Win%</th><th></th></tr></thead><tbody>
    ${rows.map(r => {
      const pct = r.w + r.l ? r.winrate : 0;
      const col = pct >= 55 ? 'var(--good)' : pct >= 45 ? 'var(--warn)' : 'var(--bad)';
      return `<tr>
        <td><b>${UI.escape(r.key)}</b>${sub && sub(r.key) ? ` <span class="muted" style="font-size:.72rem">${sub(r.key)}</span>` : ''}</td>
        <td>${r.total}</td><td>${r.w}-${r.l}</td>
        <td style="color:${r.w + r.l ? col : 'var(--text-dim)'};font-weight:600">${r.w + r.l ? pct + '%' : '-'}</td>
        <td style="width:80px"><div class="mech-track" style="height:6px"><div class="mech-fill" style="width:${pct}%;background:${col}"></div></div></td>
      </tr>`;
    }).join('')}</tbody></table>`;
};

/* -- Add / edit ------------------------------------------------------------- */
Matches.edit = function (id) {
  const m = id ? DB.matches.find(x => x.id === id) : null;
  Matches._formHeroes = m ? (m.heroes || []).slice() : [];
  const f = (k, d = '') => UI.escape(m ? (m[k] ?? d) : d);

  const modes = [...new Set(OW_MAPS.map(x => x.mode))];
  const mapOpts = modes.map(mode => `<optgroup label="${mode}">${OW_MAPS.filter(x => x.mode === mode).map(x => `<option ${m && m.map === x.name ? 'selected' : ''}>${UI.escape(x.name)}</option>`).join('')}</optgroup>`).join('');

  UI.modal(`
    <div class="modal-head"><h2>${m ? 'Edit Match' : 'Log Match'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row">
      <label class="field"><span>Date</span><input id="m-date" type="date" value="${f('date', UI.today())}"></label>
      <label class="field"><span>Type</span><select id="m-type">${['Competitive', 'Scrim', 'Quick Play', 'Custom', 'Tournament'].map(t => `<option ${m && m.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Result</span><select id="m-result">${['Win', 'Loss', 'Draw'].map(r => `<option ${m && m.result === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>Role</span><select id="m-role" onchange="Matches.renderRoleHeroes()"><option value="">-</option>${['Tank', 'Damage', 'Support'].map(r => `<option ${m && m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="field"><span>Map</span><select id="m-map"><option value="">-</option>${mapOpts}</select></label>
    </div>
    <label class="field"><span>Heroes played</span>
      <div id="m-hero-chips" class="hero-pool" style="margin-bottom:.4rem"></div>
      <div id="m-role-heroes" class="role-quickadd" style="max-height:96px"></div>
    </label>
    <div class="row">
      <label class="field"><span>Rank before</span><input id="m-rankBefore" value="${f('rankBefore')}" placeholder="e.g. Diamond 3"></label>
      <label class="field"><span>Rank after</span><input id="m-rankAfter" value="${f('rankAfter')}" placeholder="e.g. Diamond 2"></label>
      <label class="field"><span>Replay code</span><input id="m-replayCode" value="${f('replayCode')}" placeholder="ABC123"></label>
    </div>
    <label class="field"><span>Enemy comp / notes</span><textarea id="m-notes" placeholder="What happened, key mistakes, matchup notes...">${f('notes')}</textarea></label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Matches.save('${id || ''}')">${m ? 'Save' : 'Log Match'}</button>
    </div>`, { wide: true });

  Matches.renderFormHeroes();
  Matches.renderRoleHeroes();
};

Matches.renderRoleHeroes = function () {
  const role = document.getElementById('m-role').value;
  const box = document.getElementById('m-role-heroes');
  const pool = (typeof HEROES !== 'undefined' ? HEROES : []).filter(h => !role || h.role === role);
  box.innerHTML = pool.map(h => `<button type="button" class="mini-hero" onclick="Matches.toggleFormHero('${UI.attr(h.name)}')">${UI.escape(h.name)}</button>`).join('');
};
Matches.toggleFormHero = function (name) {
  const i = Matches._formHeroes.indexOf(name);
  if (i >= 0) Matches._formHeroes.splice(i, 1); else Matches._formHeroes.push(name);
  Matches.renderFormHeroes();
};
Matches.renderFormHeroes = function () {
  const box = document.getElementById('m-hero-chips');
  box.innerHTML = Matches._formHeroes.length
    ? Matches._formHeroes.map(n => `<span class="hero-chip"><span class="hero-dot" style="background:var(--accent)"></span>${UI.escape(n)}<button class="hero-x" onclick="Matches.toggleFormHero('${UI.attr(n)}')">x</button></span>`).join('')
    : '<span class="muted" style="font-size:.78rem">Pick a role, then click heroes below.</span>';
};

Matches.save = function (id) {
  const get = k => document.getElementById('m-' + k).value.trim();
  const map = get('map');
  const data = {
    date: get('date') || UI.today(), type: get('type'), result: get('result'),
    role: get('role'), map, mode: MAP_MODE[map] || '', heroes: Matches._formHeroes.slice(),
    rankBefore: get('rankBefore'), rankAfter: get('rankAfter'), replayCode: get('replayCode'), notes: get('notes'),
  };
  if (id) Object.assign(DB.matches.find(x => x.id === id), data);
  else DB.matches.push({ id: uid(), clientId: activeClient().id, ...data, createdAt: new Date().toISOString() });
  saveDB();
  UI.closeModal();
  UI.toast('Match logged.', 'good');
  UI.refresh();
};

Matches.remove = function (id) {
  UI.confirm('Delete this match?', () => {
    DB.matches = DB.matches.filter(x => x.id !== id);
    saveDB(); UI.toast('Match deleted.'); UI.refresh();
  });
};

/* -- Map Playbook (shared knowledge base) ----------------------------------- */
Matches.playbook = function () {
  const modes = [...new Set(OW_MAPS.map(x => x.mode))];
  UI.modal(`
    <div class="modal-head"><h2>Map Playbook</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <p class="muted" style="font-size:.82rem;margin-bottom:.8rem">Reusable per-map notes (setups, choke points, ult timings). Shared across all your clients.</p>
    <div style="max-height:60vh;overflow-y:auto">
    ${modes.map(mode => `
      <h3 style="font-size:.82rem;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;margin:.8rem 0 .4rem">${mode}</h3>
      ${OW_MAPS.filter(x => x.mode === mode).map(x => {
        const v = (DB.playbook[x.name] || {}).notes || '';
        return `<label class="field" style="margin-bottom:.6rem"><span>${UI.escape(x.name)}</span>
          <textarea style="min-height:48px" placeholder="Notes for ${UI.escape(x.name)}..." onblur="Matches.savePlaybook('${UI.attr(x.name)}', this.value)">${UI.escape(v)}</textarea></label>`;
      }).join('')}
    `).join('')}
    </div>
    <div class="modal-foot"><button class="btn btn-primary" onclick="UI.closeModal()">Done</button></div>`, { wide: true });
};
Matches.savePlaybook = function (map, notes) {
  notes = notes.trim();
  if (notes) DB.playbook[map] = { notes }; else delete DB.playbook[map];
  saveDB();
};


