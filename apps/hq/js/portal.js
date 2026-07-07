/* =============================================================================
   PORTAL -export a client's data as a single self-contained, interactive
   HTML file (inline CSS/JS) that the coach can send to the client.
   ============================================================================= */
const Portal = {};

Portal.CSS = `
  *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;}
  body{background:#0d1117;color:#e6edf3;line-height:1.5;padding:0 0 60px;}
  a{color:#e8833a;text-decoration:none;font-weight:600;} a:hover{text-decoration:underline;}
  .wrap{max-width:980px;margin:0 auto;padding:0 20px;}
  header{background:linear-gradient(160deg,#161b22,#0d1117);border-bottom:2px solid #e8833a;padding:26px 0;}
  .brand{display:flex;align-items:center;gap:9px;font-size:13px;letter-spacing:.1em;color:#9aa6b2;text-transform:uppercase;margin-bottom:10px;}
  .brand-logo{width:34px;height:34px;object-fit:contain;border-radius:7px;}
  .dot{width:11px;height:11px;border-radius:50%;background:#e8833a;box-shadow:0 0 12px #e8833a;}
  h1{font-size:30px;} .hsub{color:#9aa6b2;font-size:15px;margin-top:4px;}
  nav{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0 22px;}
  nav button{background:#161b22;border:1px solid #2a313c;color:#9aa6b2;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;}
  nav button.on{background:#e8833a;border-color:#e8833a;color:#15191f;}
  section{display:none;} section.on{display:block;animation:f .2s;}
  @keyframes f{from{opacity:0;transform:translateY(4px);}to{opacity:1;}}
  h2{font-size:18px;margin:22px 0 12px;color:#fff;}
  h3{font-size:15px;margin:16px 0 6px;color:#e8833a;}
  .card{background:#161b22;border:1px solid #2a313c;border-radius:12px;padding:18px;margin-bottom:14px;}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:8px;}
  .tile{background:#11161d;border:1px solid #222a33;border-radius:10px;padding:14px;}
  .tile .l{font-size:11px;color:#9aa6b2;text-transform:uppercase;letter-spacing:.05em;}
  .tile .v{font-size:26px;font-weight:800;margin-top:3px;} .v.a{color:#e8833a;}
  table{width:100%;border-collapse:collapse;font-size:13.5px;}
  th{text-align:left;color:#6b7682;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:7px 9px;border-bottom:1px solid #2a313c;}
  td{padding:7px 9px;border-bottom:1px solid #1b2129;vertical-align:top;}
  .pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11.5px;border:1px solid #2a313c;color:#9aa6b2;margin:1px;}
  .pill.mistake{color:#f85149;border-color:#f85149;} .pill.good{color:#3fb950;border-color:#3fb950;}
  .pill.drill{color:#58a6ff;border-color:#58a6ff;} .pill.key{color:#e3b341;border-color:#e3b341;}
  ul{list-style:none;} li{padding:5px 0;}
  .note{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #1b2129;}
  .note .ts{color:#e8833a;font-weight:700;font-family:Consolas,monospace;white-space:nowrap;}
  .hw{display:flex;align-items:center;gap:9px;padding:5px 0;cursor:pointer;}
  .hw .box{width:18px;height:18px;border:2px solid #2a313c;border-radius:5px;flex-shrink:0;}
  .hw.done .box{background:#3fb950;border-color:#3fb950;} .hw.done span{text-decoration:line-through;color:#6b7682;}
  .snaps{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:10px;}
  .snaps figure{border:1px solid #2a313c;border-radius:8px;overflow:hidden;}
  .snaps img{width:100%;display:block;} .snaps figcaption{font-size:12px;color:#9aa6b2;padding:6px 8px;}
  .muted{color:#9aa6b2;} .ft{text-align:center;color:#6b7682;font-size:12px;margin-top:30px;}
`;

Portal.build = function (clientId) {
  const E = UI.escape;
  const accent = typeof Brand !== 'undefined' ? Brand.accent() : '#e8833a';
  const brandName = typeof Brand !== 'undefined' ? Brand.name() : "KovaaK's Coach";
  const brandMark = typeof Brand !== 'undefined' ? Brand.logoHtml('brand-logo') : '<span class="dot"></span>';
  const brandFooter = typeof Brand !== 'undefined' ? Brand.footer() : "KovaaK's Coach";
  const attribution = typeof Brand !== 'undefined' ? Brand.attribution() : '';
  const portalCss = Portal.CSS.replace(/#e8833a/gi, accent);
  const c = getClient(clientId);
  const pls = clientPlaylists(c.id);
  const vds = clientVods(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const matches = clientMatches(c.id);
  const sessions = clientSessions(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const rec = Matches.record(matches);
  const prs = Object.entries(c.prs || {}).sort((a, b) => b[1].pr - a[1].pr);
  const goals = c.goals || [];
  const openHw = sessions.flatMap(s => s.homework || []).filter(h => !h.done).length;
  const byHero = Matches.groupStats(matches, m => m.heroes).slice(0, 10);
  const byMap = Matches.groupStats(matches, m => [m.map]).slice(0, 10);
  const TAGS_ = (typeof TAGS !== 'undefined') ? TAGS : {};
  const HW_ = (typeof HW_TYPES !== 'undefined') ? HW_TYPES : {};
  const devPlan = typeof Plans !== 'undefined' ? Plans.current(c) : null;
  const trackerStats = c.trackerStats || null;

  const statTable = (rows, label) => `<table><thead><tr><th>${label}</th><th>GP</th><th>W-L</th><th>Win%</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${E(r.key || '-')}</td><td>${r.total}</td><td>${r.w}-${r.l}</td><td>${r.w + r.l ? r.winrate + '%' : '-'}</td></tr>`).join('')}</tbody></table>`;

  const overview = `
    <div class="tiles">
      <div class="tile"><div class="l">Match Win Rate</div><div class="v a">${trackerStats && trackerStats.winRate != null ? trackerStats.winRate + '%' : rec.total ? rec.winrate + '%' : '-'}</div></div>
      <div class="tile"><div class="l">${trackerStats ? 'Tracker Matches' : 'Record'}</div><div class="v">${trackerStats && trackerStats.matches != null ? trackerStats.matches : rec.total ? `${rec.w}-${rec.l}-${rec.d}` : '0'}</div></div>
      ${trackerStats && trackerStats.headshotPct != null ? `<div class="tile"><div class="l">Weapon accuracy</div><div class="v">${trackerStats.headshotPct}%</div></div>` : ''}
      <div class="tile"><div class="l">Routines</div><div class="v">${pls.length}</div></div>
      <div class="tile"><div class="l">VOD Reviews</div><div class="v">${vds.length}</div></div>
      <div class="tile"><div class="l">Open Homework</div><div class="v">${openHw}</div></div>
    </div>
    ${devPlan ? `<div class="card"><h3>${E(devPlan.title)} <span class="pill">Active development cycle</span></h3>
      ${devPlan.objective ? `<p class="muted">${E(devPlan.objective)}</p>` : ''}
      ${(devPlan.focusAreas || []).length ? `<p><b>Focus:</b> ${devPlan.focusAreas.map(E).join(' - ')}</p>` : ''}
      ${(devPlan.goals || []).map(g => { const m = PLAN_METRICS[g.metricKey] || PLAN_METRICS.custom, u = g.unit || m.unit || ''; return `<div style="padding:7px 0;border-top:1px solid #2a313c"><b>${E(g.title)}</b><div class="muted">${E(m.label)} - ${Plans.fmt(g.current)}${E(u)} / ${Plans.fmt(g.target)}${E(u)} - ${Plans.goalProgress(g)}%</div></div>`; }).join('')}
    </div>` : ''}
    ${c.notes ? `<div class="card"><h3>Coach's notes</h3><div class="muted">${E(c.notes)}</div></div>` : ''}
    ${goals.length ? `<div class="card"><h3>Goals</h3><ul>${goals.map(g => `<li>${g.done ? 'done' : 'open'} - ${E(g.text)}</li>`).join('')}</ul></div>` : ''}`;

  const training = `
    ${pls.length ? pls.map(p => `<div class="card"><h3>${E(p.name)} <span class="muted" style="font-weight:400">- ${p.scenarios.length} scenarios - ~${p.scenarios.reduce((s, x) => s + x.reps, 0)} min</span></h3>
      <table><thead><tr><th>Scenario</th><th>Reps</th><th>Category</th><th>Coach note</th></tr></thead><tbody>
      ${p.scenarios.map(s => { const t = DB.scenarios[s.name] || {}; const cat = [t.category, t.subcategory].filter(Boolean).join(' / ') || '-'; return `<tr><td>${E(s.name)}</td><td>${s.reps}</td><td>${E(cat)}</td><td class="muted">${E(t.note || '')}</td></tr>`; }).join('')}
      </tbody></table></div>`).join('') : '<div class="card muted">No routines assigned yet.</div>'}
    ${prs.length ? `<div class="card"><h3>Personal Bests</h3><table><thead><tr><th>Scenario</th><th>PR</th><th>Plays</th><th>Last</th></tr></thead><tbody>
      ${prs.map(([n, p]) => `<tr><td>${E(n)}</td><td style="color:${accent};font-weight:700">${p.pr.toFixed(1)}</td><td>${p.plays}</td><td class="muted">${UI.fmtDate(p.lastDate)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;

  const matchesSec = trackerStats ? `
    <div class="tiles"><div class="tile"><div class="l">Win Rate</div><div class="v a">${trackerStats.winRate == null ? '-' : trackerStats.winRate + '%'}</div></div>
      <div class="tile"><div class="l">Matches</div><div class="v">${trackerStats.matches ?? '-'}</div></div>
      <div class="tile"><div class="l">Weapon accuracy</div><div class="v">${trackerStats.headshotPct == null ? '-' : trackerStats.headshotPct + '%'}</div></div>
      <div class="tile"><div class="l">Elims / 10</div><div class="v">${trackerStats.kd ?? '-'}</div></div>
      <div class="tile"><div class="l">Damage / 10</div><div class="v">${trackerStats.adr ?? '-'}</div></div>
      <div class="tile"><div class="l">Healing / 10</div><div class="v">${trackerStats.acs ?? '-'}</div></div></div>
    <div class="card"><h3>Profile snapshot</h3><p class="muted">Recorded ${UI.fmtDate(trackerStats.updatedAt)}${trackerStats.rank ? ` - ${E(trackerStats.rank)}` : ''}. Open the live public profile for current details.</p>${typeof Tracker !== 'undefined' && Tracker.connected(c) ? `<p style="margin-top:8px"><a href="${E(Tracker.profileUrl(c))}" target="_blank">Open Overwatch profile -&gt;</a></p>` : ''}</div>`
    : matches.length ? `
      <div class="tiles"><div class="tile"><div class="l">Win Rate</div><div class="v a">${rec.winrate}%</div></div>
        <div class="tile"><div class="l">Record</div><div class="v">${rec.w}-${rec.l}-${rec.d}</div></div>
        <div class="tile"><div class="l">Games</div><div class="v">${rec.total}</div></div></div>
      <div class="card"><h3>By Hero</h3>${statTable(byHero, 'Hero')}</div>
      <div class="card"><h3>By Map</h3>${statTable(byMap, 'Map')}</div>` : '<div class="card muted">No matches logged yet.</div>';

  const vodsSec = vds.length ? vds.map(v => `<div class="card">
      <h3>${E(v.title)} <span class="muted" style="font-weight:400">- ${UI.fmtDate(v.date)}</span></h3>
      <div style="margin-bottom:8px"><a href="${E(v.url)}" target="_blank">> Open VOD</a></div>
      ${v.summary ? `<div class="muted" style="margin-bottom:8px">${E(v.summary)}</div>` : ''}
      ${v.notes.map(n => `<div class="note"><a class="ts" href="${Portal.deep(v, n.t)}" target="_blank">${UI.fmtTime(n.t)}</a><div><span class="pill ${n.tag}">${E(TAGS_[n.tag] || n.tag)}</span> ${E(n.text)}</div></div>`).join('')}
      ${(v.snapshots || []).length ? `<div class="snaps">${v.snapshots.map(s => `<figure><img src="${s.dataUrl}"><figcaption>${UI.fmtTime(s.t)}${s.caption ? ' - ' + E(s.caption) : ''}</figcaption></figure>`).join('')}</div>` : ''}
      ${(v.clips || []).length ? `<div class="snaps">${v.clips.map(cl => `<figure><img src="${cl.gif}"><figcaption>🎞 ${UI.fmtTime(cl.t)}${cl.caption ? ' - ' + E(cl.caption) : ''}</figcaption></figure>`).join('')}</div>` : ''}
    </div>`).join('') : '<div class="card muted">No VOD reviews yet.</div>';

  const sessionsSec = sessions.length ? sessions.map(s => `<div class="card">
      <h3>${UI.fmtDate(s.date)} <span class="muted" style="font-weight:400">- ${s.durationMin || 0} min${s.topics ? ' - ' + E(s.topics) : ''}</span></h3>
      ${s.notes ? `<div class="muted" style="margin-bottom:8px">${E(s.notes)}</div>` : ''}
      ${(s.homework || []).map(h => `<div class="hw${h.done ? ' done' : ''}" onclick="this.classList.toggle('done')"><span class="box"></span><span><span class="pill">${E(HW_[h.type] || h.type)}</span> ${E(h.text)}</span></div>`).join('')}
    </div>`).join('') : '<div class="card muted">No sessions logged yet.</div>';

  const tabs = [
    ['overview', 'Overview', overview],
    ['training', 'Training', training],
    ['matches', 'Matches', matchesSec],
    ['vods', 'VOD Reviews', vodsSec],
    ['sessions', 'Sessions', sessionsSec],
  ];

  return `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8"><meta http-equiv="Content-Language" content="en-US"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${E(c.name)} -${E(brandName)} Portal</title><style>${portalCss}</style></head><body>
    <header><div class="wrap"><div class="brand">${brandMark} ${E(brandName)} -Client Portal</div>
      <h1>${E(c.name)}</h1><div class="hsub">${[c.game, c.rank, c.cm360 && c.cm360 + ' cm/360', c.dpi && c.dpi + ' DPI', c.sens && 'sens ' + c.sens].filter(Boolean).map(E).join(' - ')}</div></div></header>
    <div class="wrap">
      <nav>${tabs.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" onclick="show('${t[0]}',this)">${t[1]}</button>`).join('')}</nav>
      ${tabs.map((t, i) => `<section id="${t[0]}" class="${i === 0 ? 'on' : ''}">${t[2]}</section>`).join('')}
      <div class="ft">${E(brandFooter)}${attribution ? ' - ' + attribution : ''} - ${UI.fmtDate(UI.today())}</div>
    </div>
    <script>function show(id,btn){document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===id));document.querySelectorAll('nav button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');window.scrollTo(0,0);}<\/script>
    </body></html>`;
};

// Self-contained deep link (Portal can't depend on Vods being loaded in the export).
Portal.deep = function (v, sec) {
  if (v.platform === 'youtube') return `https://youtu.be/${v.videoId}?t=${Math.floor(sec)}`;
  if (v.platform === 'twitch') return `https://www.twitch.tv/videos/${v.videoId}?t=${UI.hms(sec)}`;
  return v.url;
};

Portal.export = function (clientId) {
  const c = getClient(clientId);
  const fname = `${c.name} - Coaching Portal`.replace(/[^\w\- ]+/g, '').slice(0, 60) + '.html';
  UI.toast('Building portal...');
  window.api.exportHtml(fname, Portal.build(clientId))
    .then(r => UI.toast(r.success ? 'Portal saved: ' + r.msg.split(/[\\/]/).pop() : r.msg, r.success ? 'good' : 'bad'));
};





