/* =============================================================================
   REPORTS -PDF export (VOD coaching report + client progress report)
   ============================================================================= */
const Reports = {};

const REPORT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1f29; font-size: 11pt; margin: 0; }
  h1 { font-size: 19pt; margin: 0 0 2pt; }
  h2 { font-size: 12.5pt; margin: 18pt 0 6pt; color: #b85a18; border-bottom: 1.5px solid #e6c4a3; padding-bottom: 3pt; }
  h3 { font-size: 10.5pt; margin: 10pt 0 4pt; color: #333; }
  .meta { color: #6b7280; font-size: 9.5pt; margin-bottom: 4pt; }
  .lead { color: #374151; font-size: 10pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 6pt 0 10pt; }
  th { text-align: left; background: #faf3ec; border-bottom: 1.5px solid #e6c4a3; padding: 4pt 6pt; font-size: 8pt; text-transform: uppercase; letter-spacing: .03em; color: #8a5a2b; }
  td { padding: 4pt 6pt; border-bottom: 1px solid #eee; vertical-align: top; }
  a { color: #b85a18; text-decoration: none; font-weight: 600; }
  .chip { display: inline-block; background: #f3f4f6; border: 1px solid #d8dde3; border-radius: 10px; padding: 1pt 7pt; font-size: 8pt; margin: 1pt 3pt 1pt 0; }
  .chip.mistake { background: #fdecea; color: #c0392b; border-color: #f3c2bd; }
  .chip.good { background: #eafaf0; color: #1e8a4c; border-color: #bce8cf; }
  .chip.drill { background: #eaf2fd; color: #2563c0; border-color: #c2d6f3; }
  .chip.key { background: #fdf6e3; color: #a17a17; border-color: #ecdca6; }
  .ts { font-family: Consolas, monospace; white-space: nowrap; }
  .summary-box { background: #faf3ec; border: 1px solid #ecd9c4; border-radius: 6px; padding: 8pt 10pt; font-size: 9.5pt; margin: 6pt 0; }
  .head-row { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #e8833a; padding-bottom: 6pt; }
  .brand { color: #b85a18; font-weight: 700; font-size: 9pt; letter-spacing: .04em; }
  .brand-line { display: flex; align-items: center; gap: 6pt; margin-bottom: 2pt; }
  .brand-logo { width: 24pt; height: 24pt; object-fit: contain; border-radius: 4pt; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 18pt; font-size: 9.5pt; margin: 6pt 0; }
  .grid2 b { color: #555; font-weight: 600; }
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7pt; margin: 8pt 0; }
  .metric { border: 1px solid #e6c4a3; border-radius: 6px; padding: 7pt; page-break-inside: avoid; }
  .metric .label { color: #6b7280; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; }
  .metric .value { font-size: 16pt; font-weight: 700; margin: 2pt 0; }
  .delta { font-size: 8pt; color: #6b7280; }
  .delta.good { color: #1e8a4c; } .delta.bad { color: #c0392b; }
  .report-callout { border-left: 3px solid #e8833a; background: #faf3ec; padding: 8pt 10pt; margin: 8pt 0; }
  .foot { margin-top: 20pt; padding-top: 6pt; border-top: 1px solid #ddd; color: #9aa1ab; font-size: 8pt; text-align: center; }
  ul { margin: 4pt 0; padding-left: 16pt; font-size: 9.5pt; }
`;

Reports.shell = function (title, bodyHtml) {
  const accent = typeof Brand !== 'undefined' ? Brand.accent() : '#e8833a';
  const css = REPORT_CSS.replace(/#e8833a/gi, accent).replace(/#b85a18/gi, accent);
  const footer = typeof Brand !== 'undefined' ? Brand.footer() : "KovaaK's Coach";
  const attribution = typeof Brand !== 'undefined' ? Brand.attribution() : '';
  return `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8"><meta http-equiv="Content-Language" content="en-US"><title>${UI.escape(title)}</title><style>${css}</style></head>
    <body>${bodyHtml}
    <div class="foot">${UI.escape(footer)}${attribution ? ' - ' + UI.escape(attribution) : ''} - ${UI.fmtDate(UI.today())}</div>
    </body></html>`;
};

Reports.headRow = function (client, kicker) {
  const name = typeof Brand !== 'undefined' ? Brand.name() : "KovaaK's Coach";
  const mark = typeof Brand !== 'undefined' && Brand.logo() ? Brand.logoHtml('brand-logo') : '';
  const contact = typeof Brand !== 'undefined' ? Brand.contact() : '';
  return `<div class="head-row">
    <div><div class="brand-line">${mark}<div><div class="brand">${UI.escape(name.toUpperCase())}</div>${contact ? `<div class="meta">${UI.escape(contact)}</div>` : ''}</div></div><h1>${UI.escape(kicker)}</h1>
      <div class="meta">${UI.escape(client.name)}${client.game ? ' - ' + UI.escape(client.game) : ''}${client.rank ? ' - ' + UI.escape(client.rank) : ''}</div></div>
    <div class="meta" style="text-align:right">${UI.fmtDate(UI.today())}</div>
  </div>`;
};

/* -- Reports tab ------------------------------------------------------------ */
UI.renderers.reports = function (el) {
  if (UI.requireClient(el, 'Reports')) return;
  const c = activeClient();
  const vds = clientVods(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sess = clientSessions(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  el.innerHTML = `
    <div class="page-head"><div><h1>Reports</h1><div class="sub">Export polished PDFs for <b>${UI.escape(c.name)}</b>. Timestamps become clickable deep-links.</div></div></div>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Client Progress Report</h2></div>
        <p class="muted" style="font-size:.84rem">Full profile: goals, hero pool, match record, personal bests, assigned playlists, sessions, VOD reviews, and a unified activity timeline.</p>
        <button class="btn btn-primary mt-sm" onclick="Reports.client('${c.id}')">Export Progress PDF</button>
      </div>
      <div class="card">
        <div class="card-head"><h2>Interactive Client Portal</h2></div>
        <p class="muted" style="font-size:.84rem">Export a self-contained <code>.html</code> dashboard the client opens in any browser -tabs for stats, routines, matches, VOD reviews (with clickable timestamps & snapshots) and homework. No hosting needed; just send the file.</p>
        <button class="btn btn-primary mt-sm" onclick="Portal.export('${c.id}')">Export Client Portal (HTML)</button>
      </div>
      <div class="card">
        <div class="card-head"><h2>Session Reports</h2></div>
        ${sess.length ? sess.map(s => `
          <div class="flex between center" style="padding:.45rem 0;border-bottom:1px solid var(--border-soft)">
            <div><b>${UI.fmtDate(s.date)}</b><div class="muted" style="font-size:.76rem">${s.durationMin || 0} min${s.topics ? ' - ' + UI.escape(s.topics) : ''}</div></div>
            <button class="btn btn-xs btn-primary" onclick="Reports.session('${s.id}')">PDF</button>
          </div>`).join('') : '<p class="muted" style="font-size:.84rem">No sessions to export yet.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h2>VOD Coaching Reports</h2></div>
        ${vds.length ? vds.map(v => `
          <div class="flex between center" style="padding:.45rem 0;border-bottom:1px solid var(--border-soft)">
            <div><b>${UI.escape(v.title)}</b><div class="muted" style="font-size:.76rem">${v.notes.length} notes - ${UI.fmtDate(v.date)}</div></div>
            <button class="btn btn-xs btn-primary" onclick="Reports.vod('${v.id}')">PDF</button>
          </div>`).join('') : '<p class="muted" style="font-size:.84rem">No VOD reviews to export yet.</p>'}
      </div>
    </div>`;
};

/* -- VOD coaching report ---------------------------------------------------- */
Reports.vod = function (vodId) {
  const v = DB.vods.find(x => x.id === vodId);
  const c = getClient(v.clientId);
  const notes = v.notes.slice().sort((a, b) => a.t - b.t);

  const rows = notes.map(n => `<tr>
    <td class="ts"><a href="${Vods.deepLink(v, n.t)}">${UI.fmtTime(n.t)}</a></td>
    <td><span class="chip ${n.tag}">${TAGS[n.tag] || n.tag}</span></td>
    <td>${UI.escape(n.text)}</td>
  </tr>`).join('');

  // Quick breakdown by tag.
  const counts = notes.reduce((a, n) => { a[n.tag] = (a[n.tag] || 0) + 1; return a; }, {});
  const breakdown = Object.entries(counts).map(([t, n]) => `<span class="chip ${t}">${TAGS[t] || t}: ${n}</span>`).join(' ');

  const body = `
    ${Reports.headRow(c, 'VOD Review')}
    <h2>${UI.escape(v.title)}</h2>
    <div class="grid2">
      <div><b>Platform:</b> ${v.platform === 'youtube' ? 'YouTube' : 'Twitch'}</div>
      <div><b>Date:</b> ${UI.fmtDate(v.date)}</div>
      <div><b>VOD:</b> <a href="${UI.escape(v.url)}">${UI.escape(v.url)}</a></div>
      ${v.scenario ? `<div><b>Focus:</b> ${UI.escape(v.scenario)}</div>` : ''}
    </div>
    ${v.summary ? `<div class="summary-box"><b>Session summary.</b> ${UI.escape(v.summary)}</div>` : ''}
    <div style="margin:6pt 0">${breakdown || ''}</div>
    <h3>Timestamped notes (${notes.length})</h3>
    ${notes.length ? `<table><thead><tr><th style="width:60px">Time</th><th style="width:90px">Type</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="meta">Tip: click any timestamp to jump straight to that moment in the VOD.</div>`
      : '<p class="lead">No notes recorded.</p>'}
    ${(v.snapshots || []).length ? `<h3>Annotated snapshots (${v.snapshots.length})</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8pt">
      ${v.snapshots.map(s => `<div style="width:48%;border:1px solid #e6c4a3;border-radius:5pt;overflow:hidden">
        <img src="${s.dataUrl}" style="width:100%;display:block">
        <div style="font-size:8pt;color:#8a5a2b;padding:3pt 5pt">${UI.fmtTime(s.t)}${s.caption ? ' - ' + UI.escape(s.caption) : ''}</div></div>`).join('')}
      </div>` : ''}
    ${(v.clips || []).length ? `<h3>Mistake clips (${v.clips.length})</h3>
      ${v.clips.map(c => `<div style="margin-bottom:9pt;page-break-inside:avoid">
        <div style="font-size:8pt;color:#8a5a2b;margin-bottom:3pt"><b>${UI.fmtTime(c.t)}</b>${c.caption ? ' - ' + UI.escape(c.caption) : ''} -frame sequence -&gt;</div>
        <div style="display:flex;gap:3pt">${(c.stills || []).map(s => `<img src="${s}" style="width:${Math.floor(97 / Math.max(1, (c.stills || []).length))}%;border:1px solid #e6c4a3;border-radius:3pt;display:block">`).join('')}</div>
      </div>`).join('')}
      <div class="meta">Still frames from each clip (PDFs can't animate). The looping GIF lives in the interactive client portal and can be sent over Discord.</div>` : ''}`;

  const fname = `${c.name} - ${v.title}`.replace(/[^\w\- ]+/g, '').slice(0, 60) + '.pdf';
  Reports.export(fname, Reports.shell('VOD Review', body));
};

/* -- Client progress report ------------------------------------------------- */
Reports.client = function (clientId) {
  const c = getClient(clientId);
  const pls = clientPlaylists(c.id);
  const vds = clientVods(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const prs = Object.entries(c.prs || {}).sort((a, b) => b[1].pr - a[1].pr);
  const goals = c.goals || [];
  const activeDays = Object.keys(c.activity || {}).length;
  const totalPlays = Object.values(c.activity || {}).reduce((s, n) => s + n, 0);
  const matches = clientMatches(c.id);
  const rec = Matches.record(matches);
  const byHero = Matches.groupStats(matches, m => m.heroes).slice(0, 8);
  const byMap = Matches.groupStats(matches, m => [m.map]).slice(0, 8);
  const sessions = clientSessions(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const heroes = c.heroes || [];
  const devPlan = typeof Plans !== 'undefined' ? Plans.current(c) : null;
  const trackerStats = c.trackerStats || null;
  const owRow = (r) => `<td>${r.w}-${r.l}</td><td>${r.w + r.l ? r.winrate + '%' : '-'}</td>`;

  const playlistBlocks = pls.map(p => `
    <h3>${UI.escape(p.name)} <span class="meta">(${p.scenarios.length} scenarios - ~${p.scenarios.reduce((s, x) => s + x.reps, 0)} min)</span></h3>
    <table><thead><tr><th>Scenario</th><th style="width:50px">Reps</th><th style="width:140px">Category</th><th>Coach note</th></tr></thead><tbody>
    ${p.scenarios.map(s => {
      const t = DB.scenarios[s.name] || {};
      const cat = [t.category, t.subcategory].filter(Boolean).join(' / ') || '-';
      return `<tr><td>${UI.escape(s.name)}</td><td>${s.reps}</td><td>${UI.escape(cat)}</td><td>${UI.escape(t.note || '')}</td></tr>`;
    }).join('')}
    </tbody></table>`).join('');

  const body = `
    ${Reports.headRow(c, 'Progress Report')}
    <div class="grid2">
      ${c.rank ? `<div><b>Rank:</b> ${UI.escape(c.rank)}</div>` : ''}
      ${c.dpi ? `<div><b>DPI:</b> ${UI.escape(c.dpi)}</div>` : ''}
      ${c.sens ? `<div><b>Sens:</b> ${UI.escape(c.sens)}</div>` : ''}
      ${c.cm360 ? `<div><b>cm/360:</b> ${UI.escape(c.cm360)}</div>` : ''}
    </div>
    ${c.notes ? `<div class="summary-box">${UI.escape(c.notes)}</div>` : ''}
    ${heroes.length ? `<div style="margin:6pt 0"><b style="font-size:9.5pt;color:#555">Hero pool:</b> ${heroes.map(h => `<span class="chip">${UI.escape(h.name)}${h.main ? ' main' : ''}</span>`).join(' ')}</div>` : ''}

    <h2>Training Snapshot</h2>
    <div class="grid2">
      <div><b>Match snapshot:</b> ${trackerStats ? `${trackerStats.matches ?? '-'} Tracker matches${trackerStats.winRate == null ? '' : ` - ${trackerStats.winRate}% win`}` : rec.total ? `${rec.w}-${rec.l}-${rec.d} (${rec.winrate}% win)` : 'No matches'}</div>
      <div><b>Coaching sessions:</b> ${sessions.length}</div>
      <div><b>Playlists assigned:</b> ${pls.length}</div>
      <div><b>VOD reviews:</b> ${vds.length}</div>
      <div><b>Tracked scenarios:</b> ${prs.length}</div>
      <div><b>KovaaK's active days / plays:</b> ${activeDays} / ${totalPlays}</div>
    </div>

    ${devPlan ? `<h2>Active Development Cycle</h2>
      <h3>${UI.escape(devPlan.title)} <span class="meta">${UI.fmtDate(devPlan.startDate)} -${UI.fmtDate(devPlan.endDate)}</span></h3>
      ${devPlan.objective ? `<div class="summary-box">${UI.escape(devPlan.objective)}</div>` : ''}
      ${(devPlan.focusAreas || []).length ? `<p><b>Focus:</b> ${devPlan.focusAreas.map(UI.escape).join(' - ')}</p>` : ''}
      ${(devPlan.goals || []).length ? `<table><thead><tr><th>Outcome</th><th>Metric</th><th>Baseline</th><th>Current</th><th>Target</th><th>Progress</th></tr></thead><tbody>
        ${devPlan.goals.map(g => { const m = PLAN_METRICS[g.metricKey] || PLAN_METRICS.custom, u = g.unit || m.unit || ''; return `<tr><td>${UI.escape(g.title)}</td><td>${UI.escape(m.label)}</td><td>${Plans.fmt(g.baseline)}${UI.escape(u)}</td><td>${Plans.fmt(g.current)}${UI.escape(u)}</td><td>${Plans.fmt(g.target)}${UI.escape(u)}</td><td>${Plans.goalProgress(g)}%</td></tr>`; }).join('')}
      </tbody></table>` : ''}
      ${(devPlan.actions || []).length ? `<h3>Weekly prescriptions</h3><ul>${devPlan.actions.map(a => `<li>${UI.escape(a.title)} -${Plans.weekCount(a)}/${Math.max(1, +a.targetPerWeek || 1)} this week</li>`).join('')}</ul>` : ''}` : ''}

    ${trackerStats ? `<h2>Overwatch Profile Snapshot</h2>
      <div class="grid2">
        <div><b>Recorded:</b> ${UI.fmtDate(trackerStats.updatedAt)}</div>
        <div><b>Rank:</b> ${UI.escape(trackerStats.rank || '-')}</div>
        <div><b>Matches:</b> ${trackerStats.matches ?? '-'}</div>
        <div><b>Win rate:</b> ${trackerStats.winRate == null ? '-' : trackerStats.winRate + '%'}</div>
        <div><b>Weapon accuracy:</b> ${trackerStats.headshotPct == null ? '-' : trackerStats.headshotPct + '%'}</div>
        <div><b>Elims / 10:</b> ${trackerStats.kd ?? '-'}</div>
        <div><b>Damage / 10:</b> ${trackerStats.adr ?? '-'}</div><div><b>Healing / 10:</b> ${trackerStats.acs ?? '-'}</div>
      </div>` : ''}

    ${matches.length ? `<h2>Overwatch Performance</h2>
      <div class="grid2" style="gap:4pt 18pt">
        <div>
          <h3>By Hero</h3>
          <table><thead><tr><th>Hero</th><th style="width:36px">GP</th><th style="width:44px">W-L</th><th style="width:40px">Win%</th></tr></thead><tbody>
          ${byHero.map(r => `<tr><td>${UI.escape(r.key)}</td><td>${r.total}</td>${owRow(r)}</tr>`).join('')}</tbody></table>
        </div>
        <div>
          <h3>By Map</h3>
          <table><thead><tr><th>Map</th><th style="width:36px">GP</th><th style="width:44px">W-L</th><th style="width:40px">Win%</th></tr></thead><tbody>
          ${byMap.map(r => `<tr><td>${UI.escape(r.key || '-')}</td><td>${r.total}</td>${owRow(r)}</tr>`).join('')}</tbody></table>
        </div>
      </div>` : ''}

    ${goals.length ? `<h2>Goals</h2><ul>${goals.map(g => `<li>${g.done ? 'done' : 'open'} - ${UI.escape(g.text)}</li>`).join('')}</ul>` : ''}

    ${prs.length ? `<h2>Personal Bests</h2>
      <table><thead><tr><th>Scenario</th><th style="width:120px">Category</th><th style="width:60px">PR</th><th style="width:50px">Plays</th><th style="width:90px">Last</th></tr></thead><tbody>
      ${prs.map(([n, p]) => {
        const t = DB.scenarios[n] || {};
        const cat = [t.category, t.subcategory].filter(Boolean).join(' / ') || '-';
        return `<tr><td>${UI.escape(n)}</td><td>${UI.escape(cat)}</td><td>${p.pr.toFixed(1)}</td><td>${p.plays}</td><td>${UI.fmtDate(p.lastDate)}</td></tr>`;
      }).join('')}</tbody></table>` : ''}

    ${pls.length ? `<h2>Assigned Playlists</h2>${playlistBlocks}` : ''}

    ${vds.length ? `<h2>Recent VOD Reviews</h2>
      <table><thead><tr><th>Title</th><th style="width:90px">Date</th><th style="width:50px">Notes</th><th>Link</th></tr></thead><tbody>
      ${vds.map(v => `<tr><td>${UI.escape(v.title)}</td><td>${UI.fmtDate(v.date)}</td><td>${v.notes.length}</td><td><a href="${UI.escape(v.url)}">Open VOD</a></td></tr>`).join('')}
      </tbody></table>` : ''}

    ${sessions.length ? `<h2>Coaching Sessions</h2>
      ${sessions.slice(0, 8).map(s => {
        const hw = s.homework || [];
        return `<div class="pr-section"><b>${UI.fmtDate(s.date)}</b> <span class="meta">-${s.durationMin || 0} min${s.topics ? ' - ' + UI.escape(s.topics) : ''}</span>
          ${s.notes ? `<div class="pr-note">${UI.escape(s.notes)}</div>` : ''}
          ${hw.length ? `<ul>${hw.map(h => `<li>${h.done ? 'done' : 'open'} - ${UI.escape(h.text)}</li>`).join('')}</ul>` : ''}</div>`;
      }).join('')}` : ''}

    ${Reports.timelineSection(c.id)}`;

  const fname = `${c.name} - Progress Report`.replace(/[^\w\- ]+/g, '').slice(0, 60) + '.pdf';
  Reports.export(fname, Reports.shell('Progress Report', body));
};

/* -- Session report --------------------------------------------------------- */
Reports.session = function (sessionId) {
  const s = DB.sessions.find(x => x.id === sessionId);
  const c = getClient(s.clientId);
  const hw = s.homework || [];
  const body = `
    ${Reports.headRow(c, 'Coaching Session')}
    <div class="grid2">
      <div><b>Date:</b> ${UI.fmtDate(s.date)}</div>
      <div><b>Duration:</b> ${s.durationMin || 0} min</div>
      ${s.topics ? `<div style="grid-column:1/3"><b>Topics:</b> ${UI.escape(s.topics)}</div>` : ''}
    </div>
    ${s.notes ? `<h2>Notes</h2><p class="lead">${UI.escape(s.notes).replace(/\n/g, '<br>')}</p>` : ''}
    ${hw.length ? `<h2>Homework</h2><table><thead><tr><th style="width:90px">Type</th><th>Task</th><th style="width:60px">Status</th></tr></thead><tbody>
      ${hw.map(h => `<tr><td><span class="chip">${(typeof HW_TYPES !== 'undefined' && HW_TYPES[h.type]) || h.type}</span></td><td>${UI.escape(h.text)}</td><td>${h.done ? 'done' : 'open'}</td></tr>`).join('')}
      </tbody></table>` : '<p class="lead">No homework assigned.</p>'}`;
  const fname = `${c.name} - Session ${s.date}`.replace(/[^\w\- ]+/g, '').slice(0, 60) + '.pdf';
  Reports.export(fname, Reports.shell('Coaching Session', body));
};

Reports.timelineSection = function (clientId) {
  const ev = Timeline.build(clientId).slice(0, 20);
  if (!ev.length) return '';
  return `<h2>Activity Timeline</h2>
    <table><thead><tr><th style="width:90px">Date</th><th style="width:70px">Type</th><th>Activity</th></tr></thead><tbody>
    ${ev.map(e => `<tr><td>${UI.fmtDate(e.date)}</td><td>${(TL_META[e.kind] || {}).label || ''}</td><td>${UI.escape(e.text)}</td></tr>`).join('')}
    </tbody></table>`;
};

Reports.export = function (filename, html) {
  UI.toast('Rendering PDF...');
  window.api.exportPdf(filename, html).then(r => {
    UI.toast(r.success ? 'Saved: ' + r.msg.split(/[\\/]/).pop() : r.msg, r.success ? 'good' : 'bad');
  });
};





