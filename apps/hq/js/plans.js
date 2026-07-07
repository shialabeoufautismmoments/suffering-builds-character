/* =============================================================================
   DEVELOPMENT PLANS -measurable coaching cycles that connect diagnosis,
   prescriptions, check-ins, and recorded profile-snapshot outcomes.
   ============================================================================= */
const Plans = {};

const PLAN_METRICS = {
  custom: { label: 'Custom metric', unit: '' },
  winRate: { label: 'Win rate', unit: '%' },
  headshotPct: { label: 'Weapon accuracy', unit: '%' },
  kd: { label: 'Eliminations / 10 min', unit: '' },
  adr: { label: 'Damage / 10 min', unit: '' },
  acs: { label: 'Healing / 10 min', unit: '' },
};
const PLAN_ACTION_TYPES = ['Aim routine', 'VOD review', 'Match focus', 'Mechanics drill', 'Mental routine', 'Other'];

Plans.all = c => (c && (c.developmentPlans ||= [])) || [];
Plans.current = c => Plans.all(c).find(p => p.status === 'active') || null;
Plans._num = v => Number.isFinite(+v) ? +v : 0;
Plans.fmt = v => {
  const n = +v;
  if (!Number.isFinite(n)) return '-';
  return Math.abs(n) >= 100 ? UI.fmtNumber(Math.round(n)) : String(Math.round(n * 100) / 100);
};
Plans.goalProgress = function (g) {
  const base = +g.baseline, target = +g.target, cur = +g.current;
  if (![base, target, cur].every(Number.isFinite) || target === base) return cur === target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((cur - base) / (target - base)) * 100)));
};
Plans.planProgress = function (p) {
  const gs = p.goals || [];
  return gs.length ? Math.round(gs.reduce((s, g) => s + Plans.goalProgress(g), 0) / gs.length) : 0;
};
Plans.metricValue = function (c, key) {
  if (!c || key === 'custom') return null;
  const v = c.trackerStats && c.trackerStats[key];
  return Number.isFinite(+v) ? +v : null;
};
Plans.applyTrackerMetrics = function (c) {
  if (!c) return 0;
  let changed = 0;
  Plans.all(c).filter(p => p.status === 'active').forEach(p => (p.goals || []).forEach(g => {
    const v = Plans.metricValue(c, g.metricKey);
    if (v == null || +g.current === v) return;
    g.current = v;
    (g.history ||= []).push({ id: uid(), date: UI.today(), value: v, note: 'Updated from profile snapshot' });
    changed++;
  }));
  return changed;
};
Plans.weekStart = function () {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
Plans.weekCount = a => (a.completions || []).filter(x => (x.date || '') >= Plans.weekStart()).length;

UI.renderers.plans = function (el) {
  if (UI.requireClient(el, 'Development')) return;
  const c = activeClient();
  const all = Plans.all(c).slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  const current = Plans.current(c);
  const past = all.filter(p => p !== current);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Player Development</h1><div class="sub">Turn observations into a measurable coaching cycle for <b>${UI.escape(c.name)}</b>.</div></div>
      <button class="btn btn-primary" onclick="Plans.edit()">+ New Development Plan</button>
    </div>
    ${current ? Plans.planHtml(current, true) : UI.emptyState('🎯', 'No active development plan', 'Create a coaching cycle with measurable outcomes and weekly prescriptions.')}
    ${past.length ? `<div class="card mt"><div class="card-head"><h2>Previous cycles</h2></div>
      <table class="data"><thead><tr><th>Cycle</th><th>Dates</th><th>Status</th><th>Outcome</th><th></th></tr></thead><tbody>
      ${past.map(p => `<tr><td><b>${UI.escape(p.title)}</b></td><td class="muted">${UI.fmtDate(p.startDate)} -${UI.fmtDate(p.endDate)}</td>
        <td><span class="pill">${UI.escape(p.status || 'paused')}</span></td><td>${Plans.planProgress(p)}%</td>
        <td><button class="btn btn-xs" onclick="Plans.edit('${p.id}')">Open</button></td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
};

Plans.planHtml = function (p, expanded) {
  const goals = p.goals || [], actions = p.actions || [], pct = Plans.planProgress(p);
  return `<div class="plan-hero">
    <div class="flex between center wrap gap">
      <div>
        <div class="flex center gap-sm wrap"><h2>${UI.escape(p.title)}</h2><span class="tag accent">${UI.escape((p.status || 'active').toUpperCase())}</span></div>
        <div class="muted" style="font-size:.8rem">${UI.fmtDate(p.startDate)} -${UI.fmtDate(p.endDate)}</div>
      </div>
      <div class="flex gap-sm">
        ${p.status === 'active' ? `<button class="btn btn-sm" onclick="Plans.setStatus('${p.id}','completed')">Complete cycle</button>` : `<button class="btn btn-sm" onclick="Plans.setStatus('${p.id}','active')">Make active</button>`}
        <button class="btn btn-sm" onclick="Plans.edit('${p.id}')">Edit plan</button>
        <button class="btn btn-sm btn-danger" onclick="Plans.remove('${p.id}')">Delete</button>
      </div>
    </div>
    ${p.objective ? `<p class="plan-objective">${UI.escape(p.objective)}</p>` : ''}
    ${(p.focusAreas || []).length ? `<div class="flex gap-sm wrap mb">${p.focusAreas.map(x => `<span class="focus-chip">${UI.escape(x)}</span>`).join('')}</div>` : ''}
    <div class="plan-progress"><div style="width:${pct}%"></div></div>
    <div class="flex between center"><span class="muted" style="font-size:.75rem">Overall measured progress</span><b class="text-accent">${pct}%</b></div>
  </div>
  <div class="grid cols-2 mt">
    <div class="card">
      <div class="card-head"><h2>Measurable outcomes</h2><span class="muted" style="font-size:.75rem">${goals.length} goal${goals.length === 1 ? '' : 's'}</span></div>
      ${goals.length ? goals.map(g => Plans.goalHtml(p, g)).join('') : '<div class="muted">No outcomes defined.</div>'}
    </div>
    <div class="card">
      <div class="card-head"><h2>Weekly prescriptions</h2><span class="muted" style="font-size:.75rem">Since ${UI.fmtDate(Plans.weekStart())}</span></div>
      ${actions.length ? actions.map(a => Plans.actionHtml(p, a)).join('') : '<div class="muted">No weekly actions defined.</div>'}
    </div>
  </div>
  ${p.reviewNotes ? `<div class="card mt"><div class="card-head"><h2>Coach review</h2></div><p class="muted" style="white-space:pre-wrap">${UI.escape(p.reviewNotes)}</p></div>` : ''}`;
};

Plans.goalHtml = function (p, g) {
  const metric = PLAN_METRICS[g.metricKey] || PLAN_METRICS.custom;
  const unit = g.unit || metric.unit || '';
  const pct = Plans.goalProgress(g);
  return `<div class="plan-goal">
    <div class="flex between gap">
      <div><b>${UI.escape(g.title || metric.label)}</b><div class="muted" style="font-size:.72rem">${UI.escape(metric.label)}${g.dueDate ? ' - due ' + UI.fmtDate(g.dueDate) : ''}</div></div>
      <button class="btn btn-xs" onclick="Plans.checkIn('${p.id}','${g.id}')">Check in</button>
    </div>
    <div class="flex between center mt-sm"><span><b class="text-accent">${Plans.fmt(g.current)}${UI.escape(unit)}</b> <span class="muted">/ ${Plans.fmt(g.target)}${UI.escape(unit)}</span></span><span class="muted">${pct}%</span></div>
    <div class="plan-progress small"><div style="width:${pct}%"></div></div>
  </div>`;
};

Plans.actionHtml = function (p, a) {
  const count = Plans.weekCount(a), target = Math.max(1, +a.targetPerWeek || 1);
  const pct = Math.min(100, Math.round(count / target * 100));
  return `<div class="plan-action">
    <div class="flex between gap">
      <div><b>${UI.escape(a.title)}</b><div class="muted" style="font-size:.72rem">${UI.escape(a.type || 'Other')} - ${count}/${target} this week</div></div>
      <div class="flex gap-sm"><button class="btn btn-xs btn-primary" onclick="Plans.completeAction('${p.id}','${a.id}')">+ Done</button>
      ${count ? `<button class="btn btn-xs btn-ghost" onclick="Plans.undoAction('${p.id}','${a.id}')" title="Undo last completion">Undo</button>` : ''}</div>
    </div>
    <div class="plan-progress small"><div style="width:${pct}%"></div></div>
  </div>`;
};

Plans.dashboardHtml = function (c) {
  const p = Plans.current(c);
  if (!p) return `<div class="card mb"><div class="flex between center wrap gap"><div><h2>Player Development</h2><p class="muted" style="font-size:.8rem">No active coaching cycle yet.</p></div><button class="btn btn-primary btn-sm" onclick="App.nav('plans')">Create plan</button></div></div>`;
  const pct = Plans.planProgress(p);
  const actions = p.actions || [], done = actions.reduce((n, a) => n + Plans.weekCount(a), 0);
  const target = actions.reduce((n, a) => n + Math.max(1, +a.targetPerWeek || 1), 0);
  return `<div class="card mb">
    <div class="flex between center wrap gap">
      <div><div class="flex center gap-sm"><h2>${UI.escape(p.title)}</h2><span class="tag accent">ACTIVE CYCLE</span></div>
        <p class="muted" style="font-size:.78rem">${(p.focusAreas || []).map(UI.escape).join(' - ') || 'No focus areas set'}${p.endDate ? ' - review ' + UI.fmtDate(p.endDate) : ''}</p></div>
      <button class="btn btn-sm" onclick="App.nav('plans')">Open development plan</button>
    </div>
    <div class="grid cols-2 mt-sm">
      <div><div class="flex between"><span class="muted" style="font-size:.74rem">Measured outcome progress</span><b>${pct}%</b></div><div class="plan-progress small"><div style="width:${pct}%"></div></div></div>
      <div><div class="flex between"><span class="muted" style="font-size:.74rem">Weekly prescriptions</span><b>${done}/${target || 0}</b></div><div class="plan-progress small"><div style="width:${target ? Math.min(100, done / target * 100) : 0}%"></div></div></div>
    </div>
  </div>`;
};

Plans._draft = null;
Plans.edit = function (id) {
  const c = activeClient();
  const src = id ? Plans.all(c).find(x => x.id === id) : null;
  Plans._draft = src ? JSON.parse(JSON.stringify(src)) : {
    id: uid(), title: 'Development Cycle', status: 'active', startDate: UI.today(), endDate: '',
    objective: '', focusAreas: [], goals: [], actions: [], reviewNotes: '', createdAt: new Date().toISOString(),
  };
  Plans.renderEditor();
};
Plans.captureEditor = function () {
  if (!Plans._draft) return;
  const get = id => document.getElementById(id);
  if (!get('dp-title')) return;
  Object.assign(Plans._draft, {
    title: get('dp-title').value.trim(),
    status: get('dp-status').value,
    startDate: get('dp-start').value,
    endDate: get('dp-end').value,
    objective: get('dp-objective').value.trim(),
    focusAreas: get('dp-focus').value.split(',').map(x => x.trim()).filter(Boolean),
    reviewNotes: get('dp-review').value.trim(),
  });
  document.querySelectorAll('#dp-goals .draft-block').forEach((row, i) => {
    const g = Plans._draft.goals[i], inputs = row.querySelectorAll('input'), metric = row.querySelector('select');
    if (!g || inputs.length < 6) return;
    Object.assign(g, {
      title: inputs[0].value.trim(),
      metricKey: metric ? metric.value : g.metricKey,
      baseline: +inputs[1].value || 0,
      current: +inputs[2].value || 0,
      target: +inputs[3].value || 0,
      unit: inputs[4].value.trim(),
      dueDate: inputs[5].value,
    });
  });
  document.querySelectorAll('#dp-actions .draft-block').forEach((row, i) => {
    const a = Plans._draft.actions[i], inputs = row.querySelectorAll('input'), type = row.querySelector('select');
    if (!a || inputs.length < 2) return;
    Object.assign(a, {
      title: inputs[0].value.trim(),
      type: type ? type.value : a.type,
      targetPerWeek: Math.max(1, +inputs[1].value || 1),
    });
  });
};
Plans.renderEditor = function () {
  const p = Plans._draft;
  UI.modal(`
    <div class="modal-head"><h2>${Plans.all(activeClient()).some(x => x.id === p.id) ? 'Edit Development Plan' : 'New Development Plan'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row">
      <label class="field"><span>Cycle name</span><input id="dp-title" value="${UI.escape(p.title)}" placeholder="e.g. July consistency block"></label>
      <label class="field"><span>Status</span><select id="dp-status">${['active', 'paused', 'completed'].map(x => `<option value="${x}" ${p.status === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>Start date</span><input id="dp-start" type="date" value="${UI.escape(p.startDate || '')}"></label>
      <label class="field"><span>Target review date</span><input id="dp-end" type="date" value="${UI.escape(p.endDate || '')}"></label>
    </div>
    <label class="field"><span>Coaching objective</span><textarea id="dp-objective" placeholder="What should be meaningfully different by the end of this cycle?">${UI.escape(p.objective || '')}</textarea></label>
    <label class="field"><span>Focus areas (comma separated)</span><input id="dp-focus" value="${UI.escape((p.focusAreas || []).join(', '))}" placeholder="Crosshair placement, fight timing, cooldown timing"></label>

    <div class="divider"></div>
    <div class="flex between center mb"><h3 style="font-size:.92rem">Measurable outcomes</h3><button class="btn btn-xs" onclick="Plans.addGoal()">+ Outcome</button></div>
    <div id="dp-goals">${(p.goals || []).map((g, i) => Plans.goalEditor(g, i)).join('') || '<p class="muted" style="font-size:.8rem">Add a measurable outcome. Matching metrics update when you save an Overwatch profile snapshot.</p>'}</div>

    <div class="divider"></div>
    <div class="flex between center mb"><h3 style="font-size:.92rem">Weekly prescriptions</h3><button class="btn btn-xs" onclick="Plans.addAction()">+ Prescription</button></div>
    <div id="dp-actions">${(p.actions || []).map((a, i) => Plans.actionEditor(a, i)).join('') || '<p class="muted" style="font-size:.8rem">Add the repeatable work that should create the outcome.</p>'}</div>

    <div class="divider"></div>
    <label class="field"><span>Coach review / end-of-cycle notes</span><textarea id="dp-review" placeholder="What transferred, what did not, and what comes next?">${UI.escape(p.reviewNotes || '')}</textarea></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Plans.save()">Save plan</button></div>`, { wide: true });
};
Plans.goalEditor = function (g, i) {
  return `<div class="draft-block">
    <div class="flex between center mb-sm"><b style="font-size:.8rem">Outcome ${i + 1}</b><button class="btn btn-xs btn-danger" onclick="Plans.removeGoal(${i})">x</button></div>
    <div class="row">
      <label class="field"><span>Outcome</span><input value="${UI.escape(g.title || '')}" onchange="Plans.setGoal(${i},'title',this.value)" placeholder="Improve opening duel quality"></label>
      <label class="field"><span>Metric</span><select onchange="Plans.setGoalMetric(${i},this.value)">${Object.entries(PLAN_METRICS).map(([k, m]) => `<option value="${k}" ${g.metricKey === k ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>Baseline</span><input type="number" step="any" value="${UI.escape(g.baseline ?? 0)}" onchange="Plans.setGoal(${i},'baseline',this.value)"></label>
      <label class="field"><span>Current</span><input type="number" step="any" value="${UI.escape(g.current ?? 0)}" onchange="Plans.setGoal(${i},'current',this.value)"></label>
      <label class="field"><span>Target</span><input type="number" step="any" value="${UI.escape(g.target ?? 0)}" onchange="Plans.setGoal(${i},'target',this.value)"></label>
      <label class="field"><span>Unit</span><input value="${UI.escape(g.unit || '')}" onchange="Plans.setGoal(${i},'unit',this.value)" placeholder="%"></label>
      <label class="field"><span>Due</span><input type="date" value="${UI.escape(g.dueDate || '')}" onchange="Plans.setGoal(${i},'dueDate',this.value)"></label>
    </div>
  </div>`;
};
Plans.actionEditor = function (a, i) {
  return `<div class="draft-block">
    <div class="flex between center mb-sm"><b style="font-size:.8rem">Prescription ${i + 1}</b><button class="btn btn-xs btn-danger" onclick="Plans.removeAction(${i})">x</button></div>
    <div class="row">
      <label class="field"><span>Action</span><input value="${UI.escape(a.title || '')}" onchange="Plans.setAction(${i},'title',this.value)" placeholder="Review first deaths after each ranked block"></label>
      <label class="field"><span>Type</span><select onchange="Plans.setAction(${i},'type',this.value)">${PLAN_ACTION_TYPES.map(x => `<option ${a.type === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field"><span>Times / week</span><input type="number" min="1" max="21" value="${UI.escape(a.targetPerWeek || 1)}" onchange="Plans.setAction(${i},'targetPerWeek',this.value)"></label>
    </div>
  </div>`;
};
Plans.setGoal = (i, k, v) => { Plans._draft.goals[i][k] = ['baseline', 'current', 'target'].includes(k) ? +v : v; };
Plans.setGoalMetric = function (i, key) {
  Plans.captureEditor();
  const g = Plans._draft.goals[i], m = PLAN_METRICS[key] || PLAN_METRICS.custom;
  g.metricKey = key;
  if (!g.unit || g.unit === '%' || key !== 'custom') g.unit = m.unit;
  const live = Plans.metricValue(activeClient(), key);
  if (live != null) { g.current = live; if (!g.baseline) g.baseline = live; }
  Plans.renderEditor();
};
Plans.setAction = (i, k, v) => { Plans._draft.actions[i][k] = k === 'targetPerWeek' ? Math.max(1, +v || 1) : v; };
Plans.addGoal = function () {
  Plans.captureEditor();
  Plans._draft.goals.push({ id: uid(), title: '', metricKey: 'custom', baseline: 0, current: 0, target: 0, unit: '', dueDate: '', history: [] });
  Plans.renderEditor();
};
Plans.removeGoal = function (i) { Plans.captureEditor(); Plans._draft.goals.splice(i, 1); Plans.renderEditor(); };
Plans.addAction = function () {
  Plans.captureEditor();
  Plans._draft.actions.push({ id: uid(), title: '', type: 'Aim routine', targetPerWeek: 3, completions: [] });
  Plans.renderEditor();
};
Plans.removeAction = function (i) { Plans.captureEditor(); Plans._draft.actions.splice(i, 1); Plans.renderEditor(); };
Plans.save = function () {
  Plans.captureEditor();
  const p = Plans._draft, c = activeClient();
  if (!p.title) { UI.toast('Plan name is required.', 'bad'); return; }
  if (p.status === 'active') Plans.all(c).forEach(x => { if (x.id !== p.id && x.status === 'active') x.status = 'paused'; });
  const existing = Plans.all(c).find(x => x.id === p.id);
  if (existing) Object.assign(existing, p); else Plans.all(c).push(p);
  saveDB(); UI.closeModal(); UI.toast('Development plan saved.', 'good'); UI.refresh();
};
Plans.setStatus = function (id, status) {
  const c = activeClient(), p = Plans.all(c).find(x => x.id === id);
  if (!p) return;
  if (status === 'active') Plans.all(c).forEach(x => { if (x !== p && x.status === 'active') x.status = 'paused'; });
  p.status = status;
  if (status === 'completed') p.completedAt = new Date().toISOString();
  saveDB(); UI.refresh();
};
Plans.remove = function (id) {
  UI.confirm('Delete this development plan and its check-in history?', () => {
    const c = activeClient(); c.developmentPlans = Plans.all(c).filter(x => x.id !== id);
    saveDB(); UI.toast('Development plan deleted.'); UI.refresh();
  });
};
Plans.checkIn = function (planId, goalId) {
  const p = Plans.all(activeClient()).find(x => x.id === planId), g = p && (p.goals || []).find(x => x.id === goalId);
  if (!g) return;
  UI.modal(`<div class="modal-head"><h2>Outcome check-in</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <p style="margin-bottom:.8rem"><b>${UI.escape(g.title)}</b></p>
    <label class="field"><span>Current value</span><input id="pci-value" type="number" step="any" value="${UI.escape(g.current ?? 0)}"></label>
    <label class="field"><span>Observation</span><textarea id="pci-note" placeholder="What changed? What evidence supports this number?"></textarea></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Plans.saveCheckIn('${planId}','${goalId}')">Save check-in</button></div>`);
};
Plans.saveCheckIn = function (planId, goalId) {
  const p = Plans.all(activeClient()).find(x => x.id === planId), g = p && (p.goals || []).find(x => x.id === goalId);
  if (!g) return;
  const value = +document.getElementById('pci-value').value;
  if (!Number.isFinite(value)) { UI.toast('Enter a numeric value.', 'bad'); return; }
  g.current = value;
  (g.history ||= []).push({ id: uid(), date: UI.today(), value, note: document.getElementById('pci-note').value.trim() });
  saveDB(); UI.closeModal(); UI.toast('Check-in recorded.', 'good'); UI.refresh();
};
Plans.completeAction = function (planId, actionId) {
  const p = Plans.all(activeClient()).find(x => x.id === planId), a = p && (p.actions || []).find(x => x.id === actionId);
  if (!a) return;
  (a.completions ||= []).push({ id: uid(), date: UI.today(), at: new Date().toISOString() });
  saveDB(); UI.refresh();
};
Plans.undoAction = function (planId, actionId) {
  const p = Plans.all(activeClient()).find(x => x.id === planId), a = p && (p.actions || []).find(x => x.id === actionId);
  if (!a || !(a.completions || []).length) return;
  a.completions.pop(); saveDB(); UI.refresh();
};




