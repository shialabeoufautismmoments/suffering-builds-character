/* =============================================================================
   TELEMETRY -KovaaK's Stats CSV import, PR tracking, progression charts
   ============================================================================= */
const Telemetry = {};

// Per-session parsed runs, scoped to the client they were imported for.
Telemetry.session = { clientId: null, byScenario: {}, activity: {} };

const STATS_RE = /(.+?) - Challenge - (\d{4}\.\d{2}\.\d{2})-(\d{2})\.\d{2}\.\d{2}.*Stats\.csv/i;
const DEFAULT_KOVAAKS_BENCHMARKS = ['959'];

Telemetry.parseFile = function (name, content) {
  const m = name.match(STATS_RE);
  if (!m) return null;
  const score = content.match(/Score:\s*,\s*([-\d.]+)/i);
  if (!score) return null;
  const shots = content.match(/Shots:\s*,\s*([-\d.]+)/i);
  const hits = content.match(/Hits:\s*,\s*([-\d.]+)/i);
  return {
    scenario: m[1].trim(),
    date: m[2],                       // YYYY.MM.DD
    hour: parseInt(m[3], 10),
    score: parseFloat(score[1]),
    shots: shots ? parseFloat(shots[1]) : null,
    hits: hits ? parseFloat(hits[1]) : null,
  };
};

Telemetry.webBenchmarkIds = function (value) {
  return Array.from(new Set(String(value || '')
    .split(/[\s,;]+/)
    .map(x => x.trim())
    .filter(Boolean)));
};

Telemetry.normaliseWebScore = function (score, rankMaxes = []) {
  const n = Number(score) || 0;
  const thresholds = rankMaxes.map(Number).filter(x => isFinite(x) && x > 0);
  const maxThreshold = thresholds.length ? Math.max(...thresholds) : 0;
  return maxThreshold && n > maxThreshold * 10 ? n / 100 : n;
};

Telemetry.webScenarioRows = function (result) {
  const rows = [];
  (result && result.benchmarks || []).forEach(bench => {
    const data = bench.data || {};
    const ranks = data.ranks || [];
    Object.entries(data.categories || {}).forEach(([category, cat]) => {
      Object.entries((cat && cat.scenarios) || {}).forEach(([scenario, sc]) => {
        const rawScore = Number(sc && sc.score) || 0;
        if (rawScore <= 0) return;
        const rankMaxes = (sc && sc.rank_maxes) || [];
        const scenarioRank = Number(sc && sc.scenario_rank) || 0;
        rows.push({
          benchmarkId: String(bench.benchmarkId),
          category,
          scenario,
          score: Telemetry.normaliseWebScore(rawScore, rankMaxes),
          rawScore,
          leaderboardRank: sc && sc.leaderboard_rank,
          scenarioRank,
          scenarioRankName: ranks[scenarioRank] && ranks[scenarioRank].name || '',
          leaderboardId: sc && sc.leaderboard_id,
        });
      });
    });
  });
  return rows;
};

Telemetry.webSnapshot = function (result, rows) {
  return (result && result.benchmarks || []).map(bench => {
    const data = bench.data || {};
    const ranks = data.ranks || [];
    const overallRank = Number(data.overall_rank) || 0;
    return {
      benchmarkId: String(bench.benchmarkId),
      progress: Number(data.benchmark_progress) || 0,
      overallRank,
      rankName: ranks[overallRank] && ranks[overallRank].name || '',
      scenariosSynced: rows.filter(r => r.benchmarkId === String(bench.benchmarkId)).length,
      categories: Object.entries(data.categories || {}).map(([name, cat]) => ({
        name,
        progress: Number(cat && cat.benchmark_progress) || 0,
        rank: Number(cat && cat.category_rank) || 0,
      })),
    };
  });
};

Telemetry.applyWebSync = function (client, result) {
  const rows = Telemetry.webScenarioRows(result);
  const fetchedAt = result && result.fetchedAt || new Date().toISOString();
  const fetchedDate = fetchedAt.slice(0, 10);
  client.prs ||= {};
  client.prHistory ||= {};
  let improved = 0;
  rows.forEach(row => {
    ensureScenario(row.scenario);
    const prev = client.prs[row.scenario];
    const prevPr = Number(prev && prev.pr);
    if (!prev || !isFinite(prevPr) || row.score >= prevPr) {
      client.prs[row.scenario] = {
        ...(prev || {}),
        pr: row.score,
        plays: Math.max(1, Number(prev && prev.plays) || 0),
        lastDate: fetchedDate,
        source: 'kovaaks-web',
        category: row.category,
        leaderboardRank: row.leaderboardRank,
        scenarioRank: row.scenarioRank,
        scenarioRankName: row.scenarioRankName,
        leaderboardId: row.leaderboardId,
        benchmarkId: row.benchmarkId,
      };
      const series = (client.prHistory[row.scenario] ||= []);
      const last = series[series.length - 1];
      if (!last || row.score > Number(last.pr)) {
        if (last && last.d === fetchedDate) last.pr = Math.max(Number(last.pr) || 0, row.score);
        else series.push({ d: fetchedDate, pr: row.score });
      }
      improved++;
    }
  });
  client.kovaaksWeb = {
    steamId: result.steamId,
    benchmarkIds: result.benchmarkIds,
    lastSyncAt: fetchedAt,
    source: 'kovaaks-webapp-backend',
    snapshots: Telemetry.webSnapshot(result, rows),
  };
  return { rows, improved };
};

Telemetry.webConfigForClient = function (client) {
  const web = client && client.kovaaksWeb || {};
  return {
    steamId: String((client && client.steamId) || web.steamId || '').trim(),
    benchmarkIds: (web.benchmarkIds && web.benchmarkIds.length ? web.benchmarkIds : DEFAULT_KOVAAKS_BENCHMARKS).map(String),
    autoSync: !!web.autoSync,
  };
};

Telemetry.autoSyncCandidates = function (clients) {
  return (clients || []).filter(c => {
    const cfg = Telemetry.webConfigForClient(c);
    return cfg.autoSync && /^\d{15,20}$/.test(cfg.steamId) && cfg.benchmarkIds.length;
  });
};

Telemetry.syncClient = async function (client, config, opts = {}) {
  const cfg = config || Telemetry.webConfigForClient(client);
  const result = await window.api.kovaaksWebSync({ steamId: cfg.steamId, benchmarkIds: cfg.benchmarkIds });
  if (!result || !result.success) {
    if (!opts.quiet) UI.toast(result && result.msg || 'KovaaK\'s web sync failed.', 'bad');
    return { success: false, msg: result && result.msg || 'Sync failed.' };
  }
  const applied = Telemetry.applyWebSync(client, result);
  client.kovaaksWeb.autoSync = !!cfg.autoSync;
  saveDB();
  return { success: true, result, applied };
};

Telemetry.startupAutoSync = async function () {
  if (Telemetry._startupAutoSyncDone) return;
  Telemetry._startupAutoSyncDone = true;
  const clients = Telemetry.autoSyncCandidates(DB.clients);
  if (!clients.length || !window.api.kovaaksWebSync) return;
  let synced = 0;
  for (const client of clients) {
    try {
      const out = await Telemetry.syncClient(client, null, { quiet: true });
      if (out.success) synced++;
    } catch (e) {}
  }
  if (synced) {
    UI.toast(`Auto-synced KovaaK's telemetry for ${synced} client${synced === 1 ? '' : 's'}.`, 'good');
    if (UI.currentView === 'telemetry') UI.refresh();
  }
};

Telemetry.watchlist = function (client) {
  client.telemetryWatchlist ||= [];
  return client.telemetryWatchlist;
};

Telemetry.isWatched = function (client, scenario) {
  return Telemetry.watchlist(client).includes(scenario);
};

Telemetry.toggleWatch = function (scenario) {
  const c = activeClient();
  if (!c) return;
  const list = Telemetry.watchlist(c);
  const idx = list.indexOf(scenario);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(scenario);
  saveDB();
  UI.toast(idx >= 0 ? 'Removed from watchlist.' : 'Added to watchlist.', idx >= 0 ? '' : 'good');
  UI.refresh();
};

UI.renderers.telemetry = function (el) {
  if (UI.requireClient(el, 'Telemetry')) return;
  const c = activeClient();
  const ses = Telemetry.session.clientId === c.id ? Telemetry.session : null;
  const prs = c.prs || {};
  const prRows = Object.entries(prs).sort((a, b) => b[1].pr - a[1].pr);
  const web = c.kovaaksWeb || {};
  const webConfig = Telemetry.webConfigForClient(c);
  const webBenchmarkIds = webConfig.benchmarkIds.join(', ');
  const webSteamId = webConfig.steamId;

  const sub = Telemetry.subview || 'stats';
  const seg = (a) => `<div class="seg">
    <button class="${a === 'stats' ? 'on' : ''}" onclick="Telemetry.setSub('stats')">Personal Bests</button>
    <button class="${a === 'benchmarks' ? 'on' : ''}" onclick="Telemetry.setSub('benchmarks')">Benchmarks</button>
    <button class="${a === 'progress' ? 'on' : ''}" onclick="Telemetry.setSub('progress')">Progress</button></div>`;
  if (sub === 'benchmarks') {
    el.innerHTML = `<div class="page-head"><div><h1>Telemetry</h1><div class="sub">Benchmarks for <b>${UI.escape(c.name)}</b>.</div></div>${seg('benchmarks')}</div><div id="bm-container"></div>`;
    Benchmarks.renderClientView(document.getElementById('bm-container'), c);
    return;
  }
  if (sub === 'progress') {
    el.innerHTML = `<div class="page-head"><div><h1>Telemetry</h1><div class="sub">Progress for <b>${UI.escape(c.name)}</b> over time.</div></div>${seg('progress')}</div><div id="pg-container"></div>`;
    Progress.renderClientView(document.getElementById('pg-container'), c);
    return;
  }

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Telemetry</h1><div class="sub">KovaaK's stats for <b>${UI.escape(c.name)}</b>. Sync public benchmark scores or import their Stats folder for full progression.</div></div>
      <div class="flex gap-sm center">
        ${seg('stats')}
        <button class="btn btn-primary" onclick="Telemetry.import()">Import Stats Folder</button>
      </div>
    </div>

    <div class="card mb">
      <div class="card-head"><h2>KovaaK's Web Sync</h2><span class="muted" style="font-size:.8rem">${web.lastSyncAt ? `Last synced ${UI.fmtDate(web.lastSyncAt)}` : 'Not synced yet'}</span></div>
      <div class="row">
        <label class="field"><span>Steam ID</span><input id="kvk-steam-id" value="${UI.escape(webSteamId)}" placeholder="7656119..."></label>
        <label class="field"><span>Benchmark IDs</span><input id="kvk-benchmark-ids" value="${UI.escape(webBenchmarkIds)}" placeholder="959, ..."></label>
      </div>
      <div class="flex between center gap wrap">
        <label class="flex center gap-sm" style="font-size:.78rem;color:var(--text-muted);margin:0">
          <input id="kvk-auto-sync" type="checkbox" style="width:auto" ${webConfig.autoSync ? 'checked' : ''}> Auto-sync this client on launch
        </label>
        <div class="flex gap-sm">
          <button class="btn btn-sm btn-ghost" onclick="Telemetry.saveWebConfig()">Save IDs</button>
          <button class="btn btn-sm btn-primary" id="kvk-web-sync-btn" onclick="Telemetry.webSync()">Sync from KovaaK's</button>
          <button class="btn btn-sm" onclick="Telemetry.progressCard(false)">Copy Progress Card</button>
          ${c.webhook ? `<button class="btn btn-sm" onclick="Telemetry.progressCard(true)">Post Card</button>` : ''}
        </div>
      </div>
      <div class="muted mt-sm" style="font-size:.78rem">Uses public KovaaK's benchmark data. Local CSV import still adds run-by-run history.</div>
      ${Telemetry.webSummaryHtml(web)}
    </div>

    ${Telemetry.watchlistHtml(c, prRows)}

    <div class="card mb">
      <div class="card-head"><h2>Training Activity</h2><span class="muted" style="font-size:.8rem">${Object.keys(c.activity || {}).length} active days</span></div>
      <div class="heatmap" id="heatmap"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Personal Bests</h2>
        <span class="muted" style="font-size:.8rem">${ses ? 'Click a scenario to analyse progression' : 'Showing last imported snapshot'}</span></div>
      ${prRows.length ? `<table class="data"><thead><tr><th>Scenario</th><th>Category</th><th>PR</th><th>Plays</th><th>Last</th><th></th></tr></thead><tbody>
        ${prRows.map(([n, p]) => {
          const t = DB.scenarios[n] || {};
          const cat = [t.category, t.subcategory].filter(Boolean).join(' / ') || '-';
          const canChart = ses && ses.byScenario[n];
          return `<tr>
            <td><b>${UI.escape(n)}</b></td><td class="muted">${UI.escape(cat)}</td>
            <td class="text-accent">${p.pr.toFixed(1)}</td><td>${p.plays}</td><td class="muted">${UI.fmtDate(p.lastDate)}</td>
            <td><div class="flex gap-sm">${canChart ? `<button class="btn btn-xs" onclick="Telemetry.analyze('${UI.attr(n)}')">Analyse</button>` : ''}<button class="btn btn-xs ${Telemetry.isWatched(c, n) ? 'btn-primary' : 'btn-ghost'}" onclick="Telemetry.toggleWatch('${UI.attr(n)}')">${Telemetry.isWatched(c, n) ? 'Watching' : 'Watch'}</button></div></td>
          </tr>`;
        }).join('')}
      </tbody></table>` : UI.emptyState('📊', 'No stats imported', 'Sync KovaaK\'s benchmarks or import this client\'s Stats folder to populate PRs.')}
    </div>`;

  Telemetry.renderHeatmap(c.activity || {});
};

Telemetry.setSub = function (s) { Telemetry.subview = s; UI.refresh(); };

Telemetry.webSummaryHtml = function (web) {
  const snapshots = web && web.snapshots || [];
  if (!snapshots.length) return '';
  return `<div class="web-sync-summary mt-sm">
    ${snapshots.map(s => `<div class="web-sync-item">
      <div class="muted" style="font-size:.72rem">Benchmark ${UI.escape(s.benchmarkId)}</div>
      <b>${UI.escape(s.rankName || 'Synced')}</b>
      <div class="muted" style="font-size:.76rem">${s.scenariosSynced} scored scenarios</div>
      <div class="text-accent" style="font-size:.82rem">${UI.fmtNumber(Math.round(s.progress))} progress</div>
    </div>`).join('')}
  </div>`;
};

Telemetry.watchlistHtml = function (client, prRows) {
  const list = Telemetry.watchlist(client);
  const watched = list.map(name => [name, (client.prs || {})[name]]).filter(([, p]) => p);
  return `<div class="card mb">
    <div class="card-head"><h2>Scenario Watchlist</h2><span class="muted" style="font-size:.8rem">${list.length} watched</span></div>
    ${watched.length ? `<table class="data"><thead><tr><th>Scenario</th><th>PR</th><th>Rank</th><th>Last</th><th></th></tr></thead><tbody>
      ${watched.map(([name, p]) => `<tr>
        <td><b>${UI.escape(name)}</b></td>
        <td class="text-accent">${Number(p.pr || 0).toFixed(1)}</td>
        <td class="muted">${UI.escape(p.scenarioRankName || p.category || '-')}</td>
        <td class="muted">${UI.fmtDate(p.lastDate)}</td>
        <td><button class="btn btn-xs btn-ghost" onclick="Telemetry.toggleWatch('${UI.attr(name)}')">Remove</button></td>
      </tr>`).join('')}
    </tbody></table>` : `<div class="muted" style="font-size:.82rem">${prRows.length ? 'Use Watch on Personal Best rows to pin priority scenarios here.' : 'Sync or import stats, then watch the scenarios you want to coach closely.'}</div>`}
  </div>`;
};

Telemetry.saveWebConfig = function (silent = false) {
  const c = activeClient();
  if (!c) return false;
  const steamId = document.getElementById('kvk-steam-id')?.value.trim() || '';
  const benchmarkIds = Telemetry.webBenchmarkIds(document.getElementById('kvk-benchmark-ids')?.value || '');
  const autoSync = !!document.getElementById('kvk-auto-sync')?.checked;
  c.steamId = steamId;
  c.kovaaksWeb ||= {};
  c.kovaaksWeb.steamId = steamId;
  c.kovaaksWeb.benchmarkIds = benchmarkIds;
  c.kovaaksWeb.autoSync = autoSync;
  saveDB();
  if (!silent) UI.toast('KovaaK\'s sync IDs saved.', 'good');
  return { steamId, benchmarkIds, autoSync };
};

Telemetry.webSync = async function () {
  const c = activeClient();
  if (!c) return;
  const config = Telemetry.saveWebConfig(true);
  if (!config.steamId || !/^\d{15,20}$/.test(config.steamId)) {
    UI.toast('Enter a valid numeric Steam ID first.', 'bad');
    return;
  }
  if (!config.benchmarkIds.length) {
    UI.toast('Add at least one benchmark ID.', 'bad');
    return;
  }
  const button = document.getElementById('kvk-web-sync-btn');
  if (button) { button.disabled = true; button.textContent = 'Syncing...'; }
  UI.toast('Syncing KovaaK\'s benchmark data...');
  try {
    const out = await Telemetry.syncClient(c, config);
    if (!out.success) {
      UI.toast(out.msg || 'KovaaK\'s web sync failed.', 'bad');
      return;
    }
    UI.toast(`Synced ${out.applied.rows.length} benchmark scores across ${out.result.benchmarkIds.length} benchmark(s).`, 'good');
    UI.refresh();
  } catch (e) {
    UI.toast('KovaaK\'s web sync failed.', 'bad');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Sync from KovaaK\'s'; }
  }
};

Telemetry.progressCard = function (post) {
  const c = activeClient();
  if (!c || typeof Cards === 'undefined' || !Cards.progress) return;
  Cards.progress(c.id, post);
};

Telemetry.import = async function () {
  const c = activeClient();
  UI.toast('Reading stats folder...');
  const files = await window.api.readStatsFolder();
  if (!files) return;
  if (files.error) { UI.toast('Read error: ' + files.error, 'bad'); return; }

  const byScenario = {}, activity = {};
  let parsed = 0;
  for (const f of files) {
    const run = Telemetry.parseFile(f.name, f.content);
    if (!run) continue;
    (byScenario[run.scenario] ||= []).push(run);
    activity[run.date] = (activity[run.date] || 0) + 1;
    ensureScenario(run.scenario);
    parsed++;
  }
  if (!parsed) { UI.toast('No KovaaK\'s stats files recognised in that folder.', 'bad'); return; }

  // Compute PR snapshot and persist it on the client.
  const prs = {};
  const prHistory = {};
  for (const [name, runs] of Object.entries(byScenario)) {
    let pr = -Infinity, lastDate = '';
    runs.forEach(r => { if (r.score > pr) pr = r.score; if (r.date > lastDate) lastDate = r.date; });
    prs[name] = { pr, plays: runs.length, lastDate: lastDate.replace(/\./g, '-') };
    // PR-improvement trajectory (running best, one point per date it improved) for the Progress charts.
    const sorted = runs.slice().sort((a, b) => a.date.localeCompare(b.date));
    let best = -Infinity; const series = [];
    sorted.forEach(r => {
      if (r.score > best) {
        best = r.score; const d = r.date.replace(/\./g, '-');
        const last = series[series.length - 1];
        if (last && last.d === d) last.pr = best; else series.push({ d, pr: best });
      }
    });
    if (series.length) prHistory[name] = series;
  }
  c.prs = prs;
  c.activity = activity;
  c.prHistory = prHistory;
  saveDB();

  Telemetry.session = { clientId: c.id, byScenario, activity };
  UI.toast(`Imported ${parsed} runs across ${Object.keys(byScenario).length} scenarios.`, 'good');
  UI.refresh();
};

Telemetry.renderHeatmap = function (activity) {
  const div = document.getElementById('heatmap');
  if (!div) return;
  const today = new Date();
  let html = '';
  for (let i = 370; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const p = activity[key] || 0;
    let lvl = '';
    if (p > 0 && p <= 5) lvl = 'heat-1'; else if (p <= 15) lvl = p ? 'heat-2' : ''; else if (p <= 30) lvl = 'heat-3'; else if (p) lvl = 'heat-4';
    html += `<div class="heat-day ${lvl}" title="${key.replace(/\./g, '-')}: ${p} plays"></div>`;
  }
  div.innerHTML = html;
};

/* -- Per-scenario analysis modal -------------------------------------------- */
Telemetry.analyze = function (name) {
  const ses = Telemetry.session;
  const runs = (ses.byScenario[name] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!runs.length) return;

  // Peak time-of-day and precision (over-flicking) on the latest run.
  const buckets = { Morning: [], Afternoon: [], Evening: [], Night: [] };
  runs.forEach(r => {
    const b = r.hour >= 6 && r.hour < 12 ? 'Morning' : r.hour < 18 ? 'Afternoon' : r.hour < 24 ? 'Evening' : 'Night';
    buckets[b].push(r.score);
  });
  let peak = '-', peakAvg = -Infinity;
  for (const [b, arr] of Object.entries(buckets)) {
    if (arr.length >= 2) { const avg = arr.reduce((s, x) => s + x, 0) / arr.length; if (avg > peakAvg) { peakAvg = avg; peak = b; } }
  }
  const latest = runs[runs.length - 1];
  let precision = 'No accuracy data';
  if (latest.shots && latest.hits) {
    const tax = (latest.shots - latest.hits) / latest.hits;
    precision = tax > 0.4 ? 'Severe over-flicking' : tax > 0.15 ? 'Moderate micro-correction' : 'Clean tracking';
  }
  let pr = -Infinity, prIdx = -1;
  runs.forEach((r, i) => { if (r.score > pr) { pr = r.score; prIdx = i; } });
  const plateau = runs.length > 50 && (runs.length - prIdx) > 30;

  UI.modal(`
    <div class="modal-head"><h2>${UI.escape(name)}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    ${plateau ? '<div class="warn-banner">Plateau warning: 30+ runs since the last PR. Consider a harder variant or a deload.</div>' : ''}
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">PR</div><div class="value accent">${pr.toFixed(1)}</div></div>
      <div class="stat-tile"><div class="label">Runs</div><div class="value">${runs.length}</div></div>
      <div class="stat-tile"><div class="label">Peak Window</div><div class="value" style="font-size:1.1rem">${peak}</div></div>
      <div class="stat-tile"><div class="label">Last Precision</div><div class="value" style="font-size:.95rem">${precision}</div></div>
    </div>
    <div class="chart-wrap"><canvas id="prog-chart" height="220"></canvas></div>
    <div class="card mt" style="background:var(--bg-2)">
      <h2 style="font-size:.9rem">Reverse-PR calculator</h2>
      <div class="flex gap-sm mt-sm">
        <input id="target-score" type="number" placeholder="Target score" style="flex:2">
        <button class="btn btn-primary" onclick="Telemetry.reversePR()">Calculate</button>
      </div>
      <div id="rev-out" class="text-accent mt-sm" style="font-size:.85rem"></div>
    </div>`, { wide: true });

  requestAnimationFrame(() => Telemetry.drawChart('prog-chart', runs.map(r => ({ x: r.date.substring(5), y: r.score }))));
};

Telemetry.reversePR = function () {
  const v = parseFloat(document.getElementById('target-score').value);
  if (!v) return;
  const kills = v / 10, ttk = 60 / kills;
  document.getElementById('rev-out').innerHTML =
    `To reach <b>${v}</b>: ~${kills.toFixed(1)} kills - max ${ttk.toFixed(2)}s time-to-kill pace.`;
};

/* -- Minimal dependency-free line chart ------------------------------------- */
Telemetry.drawChart = function (canvasId, data) {
  const cv = document.getElementById(canvasId);
  if (!cv || !data.length) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = cv.clientWidth || 680, cssH = 220;
  cv.width = cssW * dpr; cv.height = cssH * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const pad = { l: 44, r: 12, t: 12, b: 26 }, W = cssW, H = cssH;
  const ys = data.map(d => d.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const X = i => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : i / (data.length - 1) * (W - pad.l - pad.r));
  const Y = v => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  ctx.clearRect(0, 0, W, H);
  // gridlines + y labels
  ctx.strokeStyle = '#222a33'; ctx.fillStyle = '#6b7682'; ctx.font = '10px Consolas'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const v = min + (max - min) * g / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(v.toFixed(0), 6, y + 3);
  }
  // area fill
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8833a';
  ctx.beginPath();
  data.forEach((d, i) => { const x = X(i), y = Y(d.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.lineTo(X(data.length - 1), H - pad.b); ctx.lineTo(X(0), H - pad.b); ctx.closePath();
  ctx.fillStyle = accent + '22'; ctx.fill();
  // line
  ctx.beginPath();
  data.forEach((d, i) => { const x = X(i), y = Y(d.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
  // points + sparse x labels
  ctx.fillStyle = accent;
  const step = Math.ceil(data.length / 8);
  data.forEach((d, i) => {
    const x = X(i), y = Y(d.y);
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    if (i % step === 0 || i === data.length - 1) { ctx.fillStyle = '#6b7682'; ctx.fillText(d.x, x - 12, H - 8); ctx.fillStyle = accent; }
  });
};


