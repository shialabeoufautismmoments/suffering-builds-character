/* =============================================================================
   SEARCH -global search across clients, leads, scenarios, VODs, matches,
   playlists. Opens with the nav 🔍 button or Ctrl/Cmd+K.
   ============================================================================= */
const Search = {};

Search.open = function () {
  UI.modal(`
    <div class="modal-head"><h2>Search</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <input id="search-input" placeholder="Search clients, scenarios, VODs, matches, playlists..." oninput="Search.run(this.value)" autocomplete="off">
    <div id="search-results" style="max-height:60vh;overflow-y:auto;margin-top:.6rem"></div>`, { wide: true });
  Search.run('');
};

Search.run = function (q) {
  q = (q || '').trim().toLowerCase();
  const box = document.getElementById('search-results');
  if (!box) return;
  if (q.length < 2) { box.innerHTML = '<div class="muted" style="font-size:.82rem;padding:.5rem">Type at least 2 characters...</div>'; return; }
  const E = UI.escape, R = [];

  DB.clients.filter(c => [c.name, c.discord, c.rank, c.game, c.team].some(v => (v || '').toLowerCase().includes(q)))
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


