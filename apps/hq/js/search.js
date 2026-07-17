/* =============================================================================
   SEARCH -global search across clients, leads, scenarios, VODs, matches,
   playlists, session notes/homework, and development plan objectives/goals.
   Opens with the nav 🔍 button or Ctrl/Cmd+K.
   ============================================================================= */
const Search = {};

Search.open = function () {
  UI.modal(`
    <div class="modal-head"><h2>Search</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <input id="search-input" placeholder="Search clients, sessions, homework, plans, VODs, matches, playlists..." oninput="Search.run(this.value)" autocomplete="off">
    <div id="search-results" style="max-height:60vh;overflow-y:auto;margin-top:.6rem"></div>`, { wide: true });
  Search.run('');
};

Search.run = function (q) {
  q = (q || '').trim().toLowerCase();
  const box = document.getElementById('search-results');
  if (!box) return;
  if (q.length < 2) { box.innerHTML = '<div class="muted" style="font-size:.82rem;padding:.5rem">Type at least 2 characters...</div>'; return; }
  const E = UI.escape, R = [];

  DB.clients.filter(c => [c.name, c.discord, c.rank, c.game, c.team, c.mouse, c.mousepad, c.aimTrainerExperience].some(v => (v || '').toLowerCase().includes(q)))
    .forEach(c => R.push({ t: 'Client', l: c.name, s: [c.team, c.rank].filter(Boolean).join(' - '), a: `Search.go('client','${c.id}')` }));
  (DB.leads || []).filter(l => [l.discord, l.name, l.rank].some(v => (v || '').toLowerCase().includes(q)))
    .forEach(l => R.push({ t: 'Lead', l: l.discord || l.name || '-', s: l.rank || '', a: `Search.go('nav','waitlist')` }));
  DB.playlists.filter(p => (p.name || '').toLowerCase().includes(q))
    .forEach(p => { const c = getClient(p.clientId); R.push({ t: 'Playlist', l: p.name, s: c ? c.name : '', a: `Search.go('client','${p.clientId}','playlists')` }); });
  DB.vods.filter(v => (v.title || '').toLowerCase().includes(q) || (v.notes || []).some(n => (n.text || '').toLowerCase().includes(q)))
    .forEach(v => { const c = getClient(v.clientId); R.push({ t: 'VOD', l: v.title, s: c ? c.name : '', a: `Search.go('vod','${v.id}','${v.clientId}')` }); });
  DB.matches.filter(m => (m.map || '').toLowerCase().includes(q) || (m.heroes || []).some(h => h.toLowerCase().includes(q)) || (m.notes || '').toLowerCase().includes(q))
    .slice(0, 12).forEach(m => { const c = getClient(m.clientId); R.push({ t: 'Match', l: `${m.result} - ${m.map || '?'}`, s: c ? c.name : '', a: `Search.go('client','${m.clientId}','matches')` }); });
  Object.keys(DB.scenarios).filter(n => n.toLowerCase().includes(q)).slice(0, 12)
    .forEach(n => { const t = DB.scenarios[n]; R.push({ t: 'Scenario', l: n, s: [t.category, t.subcategory].filter(Boolean).join(' / '), a: '' }); });
  (DB.sessions || []).filter(s => [s.topics, s.notes].some(v => (v || '').toLowerCase().includes(q)))
    .slice(0, 12).forEach(s => { const c = getClient(s.clientId); R.push({ t: 'Session', l: s.topics || UI.fmtDate(s.date), s: c ? c.name : '', a: `Search.go('client','${s.clientId}','sessions')` }); });
  (DB.sessions || []).flatMap(s => (s.homework || []).map(h => ({ ...h, session: s })))
    .filter(h => (h.text || '').toLowerCase().includes(q))
    .slice(0, 12).forEach(h => { const c = getClient(h.session.clientId); R.push({ t: 'Homework', l: h.text, s: c ? c.name : '', a: `Search.go('client','${h.session.clientId}','sessions')` }); });
  DB.clients.forEach(c => (c.clientNotes || []).filter(n => (n.text || '').toLowerCase().includes(q))
    .forEach(n => R.push({ t: 'Client Note', l: n.text, s: c.name, a: `Search.go('client','${c.id}','dashboard')` })));
  DB.clients.forEach(c => (c.sessionRequests || []).filter(r => [r.message, r.preferredTimes].some(v => (v || '').toLowerCase().includes(q)))
    .forEach(r => R.push({ t: 'Session Request', l: r.message || r.preferredTimes || 'Session request', s: c.name, a: `Search.go('client','${c.id}','dashboard')` })));
  DB.clients.forEach(c => (c.developmentPlans || []).forEach(p => {
    const planHit = [p.title, p.objective].some(v => (v || '').toLowerCase().includes(q));
    if (planHit) R.push({ t: 'Plan', l: p.title || 'Development plan', s: c.name, a: `Search.go('client','${c.id}','plans')` });
    (p.goals || []).filter(g => (g.title || '').toLowerCase().includes(q))
      .forEach(g => R.push({ t: 'Goal', l: g.title, s: c.name, a: `Search.go('client','${c.id}','plans')` }));
  }));

  box.innerHTML = R.length ? R.slice(0, 50).map(r => `
    <div class="search-row" ${r.a ? `onclick="${r.a}"` : 'style="cursor:default"'}>
      <span class="pill">${r.t}</span>
      <div><b>${E(r.l)}</b>${r.s ? ` <span class="muted" style="font-size:.78rem">- ${E(r.s)}</span>` : ''}</div>
    </div>`).join('') : '<div class="muted" style="padding:.5rem">No matches.</div>';
};

Search.go = function (kind, id, extra) {
  UI.closeModal();
  const setActive = cid => { if (cid && cid !== DB.activeClientId) { DB.activeClientId = cid; saveDB(); UI.updateClientPill(); } };
  if (kind === 'client') { setActive(id); App.nav(extra || 'dashboard'); }
  else if (kind === 'nav') { App.nav(id); }
  else if (kind === 'vod') { setActive(extra); if (typeof Vods !== 'undefined') Vods.viewing = id; App.nav('vods'); }
};

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); Search.open(); }
});


