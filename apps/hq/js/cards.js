/* =============================================================================
   CARDS -render branded "trading-card" images (routines, VOD summaries,
   homework) and copy them straight to the clipboard for Discord.
   Rendering happens offscreen in the main process (render-card IPC).
   ============================================================================= */
const Cards = {};

const CARD_CAT_COLOR = { Clicking: '#e8833a', Tracking: '#5aa9e6', Switching: '#71c177' };

Cards.CSS = `
  *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif;}
  body{width:760px;background:#0d1117;color:#e6edf3;}
  .card{background:linear-gradient(160deg,#161b22,#0d1117);}
  .hd{display:flex;align-items:center;justify-content:space-between;padding:18px 26px;border-bottom:2px solid #e8833a;}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.03em;font-size:15px;}
  .dot{width:12px;height:12px;border-radius:50%;background:#e8833a;box-shadow:0 0 14px #e8833a;}
  .kicker{color:#9aa6b2;font-size:12px;text-transform:uppercase;letter-spacing:.1em;}
  .body{padding:22px 26px;}
  h1{font-size:27px;margin-bottom:5px;line-height:1.15;}
  .sub{color:#9aa6b2;font-size:14px;margin-bottom:18px;}
  .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 13px;border-radius:9px;margin-bottom:7px;background:#11161d;border:1px solid #222a33;}
  .row .n{font-weight:600;font-size:15px;}
  .pill{display:inline-block;padding:2px 9px;border-radius:20px;font-size:12px;border:1px solid #2a313c;color:#9aa6b2;white-space:nowrap;}
  .reps{background:#e8833a;color:#15191f;font-weight:800;border-radius:8px;padding:3px 11px;font-size:14px;white-space:nowrap;}
  .accent{color:#e8833a;border-color:#e8833a;}
  .tiles{display:flex;gap:10px;margin-bottom:18px;}
  .tile{flex:1;background:#11161d;border:1px solid #222a33;border-radius:10px;padding:12px 14px;}
  .tile .lbl{font-size:11px;color:#9aa6b2;text-transform:uppercase;letter-spacing:.05em;}
  .tile .val{font-size:24px;font-weight:800;margin-top:3px;}
  .ft{padding:13px 26px;border-top:1px solid #2a313c;color:#6b7682;font-size:12px;display:flex;justify-content:space-between;}
`;

Cards.shell = (kicker, bodyHtml) => {
  const accent = typeof Brand !== 'undefined' ? Brand.accent() : '#e8833a';
  const brandName = typeof Brand !== 'undefined' ? Brand.name() : "KovaaK's Coach";
  const attribution = typeof Brand !== 'undefined' ? Brand.attribution() : '';
  const css = Cards.CSS.replace(/#e8833a/gi, accent);
  return `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8"><meta http-equiv="Content-Language" content="en-US"><style>${css}</style></head>
  <body><div class="card">
    <div class="hd"><div class="brand"><span class="dot"></span> ${UI.escape(brandName)}</div><div class="kicker">${UI.escape(kicker)}</div></div>
    <div class="body">${bodyHtml}</div>
    <div class="ft"><span>Coaching asset${attribution ? ' - ' + attribution : ''}</span><span>${UI.fmtDate(UI.today())}</span></div>
  </div></body></html>`;
};

Cards._out = function (html, width, height, label, opts) {
  opts = opts || {};
  UI.toast(opts.post ? 'Rendering & posting card...' : 'Rendering card...');
  window.api.renderCard({ html, width, height, copyToClipboard: !opts.post }).then(r => {
    if (!r.success) { UI.toast(r.msg || 'Render failed.', 'bad'); return; }
    if (opts.post) Discord.post(opts.clientId, '', r.dataUrl);
    else UI.toast(`${label} card copied -paste into Discord.`, 'good');
  });
};

Cards.routine = function (playlistId, post) {
  const E = UI.escape;
  const p = DB.playlists.find(x => x.id === playlistId); if (!p) return;
  const c = getClient(p.clientId) || {};
  const total = p.scenarios.reduce((s, x) => s + x.reps, 0);
  const rows = p.scenarios.map(s => {
    const t = DB.scenarios[s.name] || {};
    const col = CARD_CAT_COLOR[t.category] || '#6b7682';
    return `<div class="row"><div><span class="n">${E(s.name)}</span>${t.category ? ` <span class="pill" style="border-color:${col};color:${col}">${E(t.category)}</span>` : ''}</div><span class="reps">${s.reps}x</span></div>`;
  }).join('');
  const body = `<h1>${E(p.name)}</h1><div class="sub">${E(c.name || '')}${c.rank ? ' - ' + E(c.rank) : ''} - ${p.scenarios.length} scenarios - ~${total} min</div>${rows}`;
  Cards._out(Cards.shell('Training Routine', body), 760, 150 + p.scenarios.length * 47 + 78, 'Routine', { clientId: p.clientId, post });
};

Cards.vodSummary = function (vodId, post) {
  const E = UI.escape;
  const v = DB.vods.find(x => x.id === vodId); if (!v) return;
  const c = getClient(v.clientId) || {};
  const byTag = v.notes.reduce((a, n) => { a[n.tag] = (a[n.tag] || 0) + 1; return a; }, {});
  const tiles = ['mistake', 'good', 'drill', 'key'].filter(t => byTag[t])
    .map(t => `<div class="tile"><div class="lbl">${E(TAGS[t] || t)}</div><div class="val">${byTag[t]}</div></div>`).join('')
    || `<div class="tile"><div class="lbl">Notes</div><div class="val accent">${v.notes.length}</div></div>`;
  const top = v.notes.slice(0, 6).map(n => `<div class="row"><span class="n" style="font-size:13px">${E(n.text.length > 72 ? n.text.slice(0, 70) + '...' : n.text)}</span><span class="pill accent">${UI.fmtTime(n.t)}</span></div>`).join('');
  const body = `<h1>${E(v.title)}</h1><div class="sub">${E(c.name || '')} - ${v.platform === 'youtube' ? 'YouTube' : 'Twitch'} - ${UI.fmtDate(v.date)} - ${v.notes.length} notes</div><div class="tiles">${tiles}</div>${top}`;
  Cards._out(Cards.shell('VOD Review', body), 760, 150 + 90 + Math.min(6, v.notes.length) * 45 + 78, 'VOD', { clientId: v.clientId, post });
};

Cards.homework = function (sessionId, post) {
  const E = UI.escape;
  const s = DB.sessions.find(x => x.id === sessionId); if (!s) return;
  const c = getClient(s.clientId) || {};
  const hw = s.homework || [];
  const rows = hw.map(h => `<div class="row"><span class="n">${h.done ? 'done' : 'open'} ${E(h.text)}</span><span class="pill">${E((typeof HW_TYPES !== 'undefined' && HW_TYPES[h.type]) || h.type)}</span></div>`).join('') || '<div class="sub">No homework assigned.</div>';
  const body = `<h1>Homework</h1><div class="sub">${E(c.name || '')} - ${UI.fmtDate(s.date)}${s.topics ? ' - ' + E(s.topics) : ''}</div>${rows}`;
  Cards._out(Cards.shell('Homework', body), 760, 150 + Math.max(1, hw.length) * 47 + 78, 'Homework', { clientId: s.clientId, post });
};

Cards.progress = function (clientId, post) {
  const E = UI.escape;
  const c = getClient(clientId); if (!c) return;
  const web = c.kovaaksWeb || {};
  const watched = c.telemetryWatchlist || [];
  const prs = Object.entries(c.prs || {});
  const preferred = watched.length ? watched.map(name => [name, c.prs && c.prs[name]]).filter(([, p]) => p) : prs;
  const rows = preferred
    .sort((a, b) => Number(b[1].pr || 0) - Number(a[1].pr || 0))
    .slice(0, 6)
    .map(([name, p]) => `<div class="row"><div><span class="n">${E(name)}</span>${p.scenarioRankName ? ` <span class="pill accent">${E(p.scenarioRankName)}</span>` : ''}</div><span class="reps">${Number(p.pr || 0).toFixed(1)}</span></div>`)
    .join('') || '<div class="sub">No synced PRs yet.</div>';
  const snapshots = web.snapshots || [];
  const tiles = [
    snapshots[0] ? `<div class="tile"><div class="lbl">Benchmark</div><div class="val accent" style="font-size:20px">${E(snapshots[0].rankName || 'Synced')}</div></div>` : '',
    `<div class="tile"><div class="lbl">Watched</div><div class="val">${watched.length}</div></div>`,
    `<div class="tile"><div class="lbl">PRs</div><div class="val">${prs.length}</div></div>`,
  ].filter(Boolean).join('');
  const avatar = UI.safeAvatar(c.avatar);
  const avatarHtml = avatar ? `<img src="${avatar}" style="width:54px;height:54px;border-radius:14px;object-fit:contain;border:1px solid #2a313c;background:#0d1117">` : '';
  const lastSync = web.lastSyncAt ? ` - synced ${UI.fmtDate(web.lastSyncAt)}` : '';
  const body = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">${avatarHtml}<div><h1 style="margin-bottom:2px">${E(c.name)}</h1><div class="sub" style="margin-bottom:0">${E(c.rank || c.game || 'Overwatch client')}${lastSync}</div></div></div><div class="tiles">${tiles}</div>${rows}`;
  Cards._out(Cards.shell('Progress Card', body), 760, 150 + 104 + Math.max(1, Math.min(6, preferred.length)) * 47 + 78, 'Progress', { clientId: c.id, post });
};


