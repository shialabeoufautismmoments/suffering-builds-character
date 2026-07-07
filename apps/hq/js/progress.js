/* =============================================================================
   PROGRESS -improvement trends over time per client: win-rate, rank, and
   per-scenario PR progression. Built from matches (dated) + prHistory (captured
   from KovaaK's stat-file dates on import).
   ============================================================================= */
const Progress = {};

const RANK_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'grandmaster', 'champion'];
// Map an Overwatch rank string (e.g. "Gold 5") to a sortable number (higher = better).
Progress.rankToNum = function (txt) {
  if (!txt) return null;
  const t = String(txt).toLowerCase();
  const ti = RANK_TIERS.findIndex(r => t.includes(r));
  if (ti < 0) return null;
  const dm = t.match(/[1-5]/);
  const div = dm ? parseInt(dm[0]) : 3;       // division 5 = lowest, 1 = highest
  return ti * 500 + (5 - div) * 100;
};

Progress._scn = null;

Progress.renderClientView = function (el, c) {
  const ms = clientMatches(c.id).filter(m => m.result).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let w = 0, dec = 0; const wr = [], rk = [];
  ms.forEach(m => {
    if (m.result === 'Win') { w++; dec++; } else if (m.result === 'Loss') { dec++; }
    if (m.result !== 'Draw' && dec) wr.push({ x: (m.date || '').slice(5), y: Math.round((w / dec) * 100) });
    const rv = Progress.rankToNum(m.rankAfter || m.rankBefore);
    if (rv != null) rk.push({ x: (m.date || '').slice(5), y: rv });
  });

  const hist = c.prHistory || {};
  const scnKeys = Object.keys(hist).filter(k => (hist[k] || []).length >= 2).sort((a, b) => hist[b].length - hist[a].length);
  if (!scnKeys.includes(Progress._scn)) Progress._scn = scnKeys[0] || null;

  if (!wr.length && !rk.length && !scnKeys.length) {
    el.innerHTML = UI.emptyState('📈', 'No progress data yet', 'Log matches (win-rate & rank trends) and import KovaaK\'s stats (PR progression). Trends accumulate over time.');
    return;
  }

  el.innerHTML = `
    <div class="grid cols-2">
      ${wr.length >= 2 ? `<div class="card"><div class="card-head"><h2>Win-rate trend</h2><span class="muted" style="font-size:.78rem">cumulative %</span></div><div class="chart-wrap"><canvas id="pg-wr" height="200"></canvas></div></div>` : ''}
      ${rk.length >= 2 ? `<div class="card"><div class="card-head"><h2>Rank trend</h2><span class="muted" style="font-size:.78rem">higher = better</span></div><div class="chart-wrap"><canvas id="pg-rank" height="200"></canvas></div></div>` : ''}
    </div>
    ${scnKeys.length ? `<div class="card mt">
      <div class="card-head"><h2>PR progression</h2>
        <select onchange="Progress._scn=this.value;UI.refresh()" style="max-width:280px">${scnKeys.map(k => `<option ${k === Progress._scn ? 'selected' : ''}>${UI.escape(k)}</option>`).join('')}</select></div>
      <div class="chart-wrap"><canvas id="pg-pr" height="220"></canvas></div>
    </div>` : '<div class="card mt"><p class="muted" style="font-size:.84rem">Import this client\'s KovaaK\'s stats to chart PR progression -the import builds a full history from the run dates.</p></div>'}`;

  requestAnimationFrame(() => {
    if (wr.length >= 2) Telemetry.drawChart('pg-wr', wr);
    if (rk.length >= 2) Telemetry.drawChart('pg-rank', rk);
    if (Progress._scn && hist[Progress._scn]) Telemetry.drawChart('pg-pr', hist[Progress._scn].map(p => ({ x: p.d.slice(5), y: p.pr })));
  });
};


