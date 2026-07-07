/* =============================================================================
   BENCHMARKS -coach-defined benchmark systems. Each benchmark has a rank
   ladder (low -> high) and scenarios; each scenario has a threshold value per
   rank (in score OR accuracy). A client's result is converted to an "energy"
   (0-100 points) by interpolating between the surrounding rank thresholds.
   ============================================================================= */
const Benchmarks = {};

const DEFAULT_RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster'];

/* -- Math ------------------------------------------------------------------- */
// Energy (0-100) for a value given the scenario's per-rank thresholds.
Benchmarks.energy = function (value, thresholds, n) {
  if (value === null || value === '' || isNaN(parseFloat(value)) || n < 2) return null;
  const v = parseFloat(value), step = 100 / (n - 1);
  const pairs = [];
  thresholds.forEach((t, i) => { if (t !== null && t !== '' && !isNaN(parseFloat(t))) pairs.push({ t: parseFloat(t), p: i * step }); });
  if (!pairs.length) return null;
  pairs.sort((a, b) => a.t - b.t);
  if (v <= pairs[0].t) return Math.max(0, Math.round(pairs[0].t ? (v / pairs[0].t) * pairs[0].p : pairs[0].p));
  if (v >= pairs[pairs.length - 1].t) return Math.round(pairs[pairs.length - 1].p);
  for (let i = 0; i < pairs.length - 1; i++) {
    if (v >= pairs[i].t && v < pairs[i + 1].t) {
      const frac = (v - pairs[i].t) / (pairs[i + 1].t - pairs[i].t);
      return Math.round(pairs[i].p + frac * (pairs[i + 1].p - pairs[i].p));
    }
  }
  return Math.round(pairs[pairs.length - 1].p);
};

Benchmarks.rankFor = function (energy, ranks) {
  if (energy === null) return '-';
  const n = ranks.length, step = 100 / (n - 1);
  return ranks[Math.max(0, Math.min(n - 1, Math.floor(energy / step + 1e-9)))];
};

Benchmarks.rankColor = function (energy, n) {
  if (energy === null) return 'var(--text-dim)';
  const idx = Math.floor(energy / (100 / (n - 1)) + 1e-9);
  return ['#cd7f32', '#9aa6b2', '#e3b341', '#5aa9e6', '#71c177', '#c678dd', '#e8833a'][Math.min(idx, 6)] || 'var(--accent)';
};

Benchmarks.resultsFor = function (client, bmId) {
  client.benchmarkResults ||= {};
  return (client.benchmarkResults[bmId] ||= {});
};

/* -- Client view (rendered inside the Telemetry tab's Benchmarks toggle) ----- */
Benchmarks._activeId = null;
Benchmarks.renderClientView = function (el, c) {
  const bms = DB.benchmarks || [];
  if (!bms.length) {
    el.innerHTML = UI.emptyState('🏅', 'No benchmarks defined yet', 'Create a custom benchmark -your scenarios, your rank thresholds.') +
      `<div style="text-align:center"><button class="btn btn-primary" onclick="Benchmarks.editDef()">+ Create Benchmark</button></div>`;
    return;
  }
  if (!bms.find(b => b.id === Benchmarks._activeId)) Benchmarks._activeId = bms[0].id;
  const bm = bms.find(b => b.id === Benchmarks._activeId);
  const ranks = bm.ranks, n = ranks.length;
  const results = Benchmarks.resultsFor(c, bm.id);

  const energies = [];
  const rows = bm.scenarios.map(s => {
    const val = results[s.id];
    const e = Benchmarks.energy(val, s.thresholds, n);
    if (e !== null) energies.push(e);
    const col = Benchmarks.rankColor(e, n);
    return `<tr>
      <td><b>${UI.escape(s.name)}</b></td>
      <td class="muted" style="font-size:.78rem">${s.metric === 'accuracy' ? 'Accuracy %' : 'Score'}</td>
      <td style="width:120px"><input type="number" value="${val != null ? UI.escape(String(val)) : ''}" placeholder="-
        onchange="Benchmarks.setResult('${bm.id}','${s.id}', this.value)" style="padding:.3rem .5rem"></td>
      <td style="width:60px;font-weight:700">${e != null ? e : '-'}</td>
      <td style="color:${col};font-weight:600">${e != null ? Benchmarks.rankFor(e, ranks) : '-'}</td>
    </tr>`;
  }).join('');

  const overall = energies.length ? Math.round(energies.reduce((a, b) => a + b, 0) / energies.length) : null;

  el.innerHTML = `
    <div class="flex between center wrap gap-sm mb">
      <div class="flex gap-sm center">
        <select onchange="Benchmarks._activeId=this.value;UI.refresh()" style="max-width:240px">
          ${bms.map(b => `<option value="${b.id}" ${b.id === bm.id ? 'selected' : ''}>${UI.escape(b.name)}</option>`).join('')}
        </select>
        <button class="btn btn-sm" onclick="Benchmarks.pullPRs('${bm.id}')" title="Auto-fill score scenarios from imported PRs">Pull PRs</button>
        <button class="btn btn-sm btn-ghost" onclick="Benchmarks.manage()">Manage</button>
      </div>
      ${overall != null ? `<div class="flex center gap-sm">
        <span class="muted" style="font-size:.78rem">Overall</span>
        <span style="font-size:1.5rem;font-weight:800;color:${Benchmarks.rankColor(overall, n)}">${Benchmarks.rankFor(overall, ranks)}</span>
        <span class="muted">- ${overall} energy</span></div>` : ''}
    </div>
    ${bm.scenarios.length ? `<div class="card"><table class="data">
      <thead><tr><th>Scenario</th><th>Metric</th><th>Result</th><th>Energy</th><th>Rank</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
      : `<div class="card muted">This benchmark has no scenarios yet. <a href="#" onclick="Benchmarks.editDef('${bm.id}');return false">Add some</a>.</div>`}
    <p class="muted" style="font-size:.74rem;margin-top:.5rem">Energy is interpolated between your rank thresholds. Enter a raw score, or an accuracy % for accuracy scenarios.</p>`;
};

Benchmarks.setResult = function (bmId, scnId, value) {
  const c = activeClient(); if (!c) return;
  const r = Benchmarks.resultsFor(c, bmId);
  if (value === '' || value == null) delete r[scnId]; else r[scnId] = parseFloat(value);
  saveDB();
  UI.refresh();
};

Benchmarks.pullPRs = function (bmId) {
  const c = activeClient(); if (!c) return;
  const bm = DB.benchmarks.find(b => b.id === bmId);
  const r = Benchmarks.resultsFor(c, bmId);
  let n = 0;
  bm.scenarios.forEach(s => {
    if (s.metric !== 'accuracy' && c.prs && c.prs[s.name] != null) { r[s.id] = c.prs[s.name].pr; n++; }
  });
  saveDB();
  UI.toast(n ? `Filled ${n} scenario(s) from PRs.` : 'No matching PRs found (names must match exactly).', n ? 'good' : 'bad');
  UI.refresh();
};

/* -- Benchmark definition management ---------------------------------------- */
Benchmarks.manage = function () {
  const bms = DB.benchmarks || [];
  UI.modal(`
    <div class="modal-head"><h2>Benchmarks</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    ${bms.length ? bms.map(b => `<div class="flex between center" style="padding:.45rem 0;border-bottom:1px solid var(--border-soft)">
        <div><b>${UI.escape(b.name)}</b><div class="muted" style="font-size:.76rem">${b.scenarios.length} scenarios - ${b.ranks.length} ranks</div></div>
        <div class="flex gap-sm"><button class="btn btn-xs" onclick="Benchmarks.editDef('${b.id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="Benchmarks.removeDef('${b.id}')">Del</button></div>
      </div>`).join('') : '<p class="muted" style="font-size:.84rem">No benchmarks yet.</p>'}
    <div class="modal-foot"><button class="btn btn-primary" onclick="Benchmarks.editDef()">+ New Benchmark</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Close</button></div>`, { wide: true });
};

Benchmarks.removeDef = function (id) {
  const b = DB.benchmarks.find(x => x.id === id);
  UI.confirm(`Delete benchmark "${b.name}"? Client results for it are kept but hidden.`, () => {
    DB.benchmarks = DB.benchmarks.filter(x => x.id !== id);
    if (Benchmarks._activeId === id) Benchmarks._activeId = null;
    saveDB(); Benchmarks.manage();
  });
};

Benchmarks.editDef = function (id) {
  const b = id ? DB.benchmarks.find(x => x.id === id) : null;
  Benchmarks._draft = b ? JSON.parse(JSON.stringify(b))
    : { id: uid(), name: 'New Benchmark', ranks: DEFAULT_RANKS.slice(), scenarios: [], createdAt: new Date().toISOString() };
  Benchmarks._editingExisting = !!b;
  Benchmarks.renderEditor();
};

Benchmarks.renderEditor = function () {
  const d = Benchmarks._draft, ranks = d.ranks;
  const scnRows = d.scenarios.map((s, i) => `
    <div class="bm-scn" style="border:1px solid var(--border);border-radius:6px;padding:.5rem;margin-bottom:.5rem">
      <div class="flex gap-sm center mb">
        <input data-scn="${i}" data-f="name" value="${UI.escape(s.name)}" placeholder="Scenario name" style="flex:2">
        <select data-scn="${i}" data-f="metric" style="max-width:130px"><option value="score" ${s.metric === 'score' ? 'selected' : ''}>Score</option><option value="accuracy" ${s.metric === 'accuracy' ? 'selected' : ''}>Accuracy %</option></select>
        <button class="btn btn-xs btn-danger" tabindex="-1" onclick="Benchmarks.scnDel(${i})">x</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(${ranks.length},1fr);gap:.3rem">
        ${ranks.map((r, ri) => `<label style="font-size:.66rem;color:var(--text-muted)">${UI.escape(r)}<input type="number" data-scn="${i}" data-th="${ri}" value="${s.thresholds[ri] != null ? UI.escape(String(s.thresholds[ri])) : ''}" placeholder="-" style="padding:.25rem;font-size:.78rem"></label>`).join('')}
      </div>
    </div>`).join('');

  UI.modal(`
    <div class="modal-head"><h2>${Benchmarks._editingExisting ? 'Edit' : 'New'} Benchmark</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>Name</span><input id="bm-name" value="${UI.escape(d.name)}"></label>
    <label class="field"><span>Ranks (low ->high, comma-separated)</span>
      <input id="bm-ranks" value="${UI.escape(ranks.join(', '))}" onchange="Benchmarks.ranksChange(this.value)"></label>
    <div class="flex between center mb"><b style="font-size:.85rem">Scenarios -threshold value to reach each rank</b>
      <button class="btn btn-xs" onclick="Benchmarks.scnAdd()">+ Add scenario</button></div>
    <div style="max-height:46vh;overflow-y:auto">${scnRows || '<p class="muted" style="font-size:.8rem">No scenarios. Add one above.</p>'}</div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Benchmarks.saveDef()">Save Benchmark</button></div>`, { wide: true });
};

// Read the modal's current field values back into the draft (before any re-render).
Benchmarks.capture = function () {
  const d = Benchmarks._draft;
  const nameEl = document.getElementById('bm-name'); if (nameEl) d.name = nameEl.value.trim() || 'Benchmark';
  document.querySelectorAll('[data-scn]').forEach(el => {
    const i = +el.dataset.scn, s = d.scenarios[i]; if (!s) return;
    if (el.dataset.f === 'name') s.name = el.value;
    else if (el.dataset.f === 'metric') s.metric = el.value;
    else if (el.dataset.th !== undefined) s.thresholds[+el.dataset.th] = el.value === '' ? null : parseFloat(el.value);
  });
};
Benchmarks.ranksChange = function (val) {
  Benchmarks.capture();
  const ranks = val.split(',').map(r => r.trim()).filter(Boolean);
  Benchmarks._draft.ranks = ranks.length >= 2 ? ranks : DEFAULT_RANKS.slice();
  Benchmarks._draft.scenarios.forEach(s => { s.thresholds = Benchmarks._draft.ranks.map((_, i) => s.thresholds[i] ?? null); });
  Benchmarks.renderEditor();
};
Benchmarks.scnAdd = function () {
  Benchmarks.capture();
  Benchmarks._draft.scenarios.push({ id: uid(), name: '', metric: 'score', thresholds: Benchmarks._draft.ranks.map(() => null) });
  Benchmarks.renderEditor();
};
Benchmarks.scnDel = function (i) {
  Benchmarks.capture();
  Benchmarks._draft.scenarios.splice(i, 1);
  Benchmarks.renderEditor();
};
Benchmarks.saveDef = function () {
  Benchmarks.capture();
  const d = Benchmarks._draft;
  d.scenarios = d.scenarios.filter(s => s.name.trim());
  const existing = DB.benchmarks.find(x => x.id === d.id);
  if (existing) Object.assign(existing, d); else DB.benchmarks.push(d);
  Benchmarks._activeId = d.id;
  saveDB();
  UI.closeModal();
  UI.toast('Benchmark saved.', 'good');
  UI.refresh();
};


