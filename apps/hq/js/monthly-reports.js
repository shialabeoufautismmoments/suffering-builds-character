/* =============================================================================
   MONTHLY REPORTS -month-over-month client progress summaries and PDFs.
   ============================================================================= */
const MonthlyReports = {};

MonthlyReports.range = function (month) {
  const key = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : UI.today().slice(0, 7);
  const [year, number] = key.split('-').map(Number);
  const keyOf = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const next = number === 12 ? keyOf(year + 1, 1) : keyOf(year, number + 1);
  const previous = number === 1 ? keyOf(year - 1, 12) : keyOf(year, number - 1);
  const label = UI.fmtMonthYear(`${key}-01T12:00:00`);
  return { key, label, start: `${key}-01`, end: `${next}-01`, previous };
};

MonthlyReports.data = function (clientId, month) {
  const c = getClient(clientId);
  const range = MonthlyReports.range(month);
  const inMonth = value => {
    const date = String(value || '').replace(/\./g, '-').slice(0, 10);
    return date >= range.start && date < range.end;
  };
  const sessions = clientSessions(clientId).filter(s => inMonth(s.date || s.createdAt));
  const vods = clientVods(clientId).filter(v => inMonth(v.date || v.createdAt));
  const matches = clientMatches(clientId).filter(m => inMonth(m.date || m.createdAt));
  const record = Matches.record(matches);
  const homework = sessions.flatMap(s => s.homework || []);
  const activity = Object.entries(c && c.activity || {}).filter(([date]) => inMonth(date));
  const prImprovements = Object.values(c && c.prHistory || {})
    .flatMap(series => series || []).filter(point => inMonth(point.d)).length;
  const plans = c && c.developmentPlans || [];
  const goalCheckins = plans.flatMap(p => p.goals || [])
    .flatMap(g => g.history || []).filter(item => inMonth(item.date)).length;
  const prescriptionCompletions = plans.flatMap(p => p.actions || [])
    .flatMap(a => a.completions || []).filter(item => inMonth(item.date)).length;
  const snapshots = [...(c && c.trackerHistory || [])];
  if (c && c.trackerStats && c.trackerStats.updatedAt && !snapshots.some(x => x.updatedAt === c.trackerStats.updatedAt)) {
    snapshots.push(c.trackerStats);
  }
  const tracker = snapshots.filter(s => inMonth(s.updatedAt)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).at(-1) || null;
  const homeworkDone = homework.filter(h => h.done).length;

  return {
    range, sessions, vods, matches, record, tracker,
    sessionMinutes: sessions.reduce((sum, s) => sum + (+s.durationMin || 0), 0),
    prepMinutes: sessions.reduce((sum, s) => sum + (+s.prepMinutes || 0), 0),
    vodNotes: vods.reduce((sum, v) => sum + (v.notes || []).length, 0),
    homeworkAssigned: homework.length,
    homeworkDone,
    homeworkRate: homework.length ? Math.round(homeworkDone / homework.length * 100) : null,
    trainingDays: activity.length,
    trainingRuns: activity.reduce((sum, [, count]) => sum + (+count || 0), 0),
    prImprovements,
    goalCheckins,
    prescriptionCompletions,
  };
};

MonthlyReports.delta = function (current, previous, suffix = '', higherIsBetter = true) {
  if (current == null || previous == null) return '<span class="delta">No previous comparison</span>';
  const difference = Math.round((current - previous) * 10) / 10;
  if (!difference) return '<span class="delta">No change</span>';
  const good = higherIsBetter ? difference > 0 : difference < 0;
  return `<span class="delta ${good ? 'good' : 'bad'}">${difference > 0 ? '+' : ''}${difference}${suffix} vs previous month</span>`;
};

MonthlyReports.pdfMetric = function (label, current, previous, suffix = '') {
  return `<div class="metric"><div class="label">${UI.escape(label)}</div><div class="value">${current == null ? '-' : current + suffix}</div>${MonthlyReports.delta(current, previous, suffix)}</div>`;
};

MonthlyReports.uiMetric = function (label, current, previous, suffix = '') {
  const difference = current == null || previous == null ? null : Math.round((current - previous) * 10) / 10;
  return `<div class="stat-tile"><div class="label">${UI.escape(label)}</div><div class="value">${current == null ? '-' : current + suffix}</div>
    <div class="muted" style="font-size:.68rem">${difference == null ? 'No previous comparison' : difference === 0 ? 'No change' : `${difference > 0 ? '+' : ''}${difference}${suffix} vs previous month`}</div></div>`;
};

MonthlyReports.autoSummary = function (client, data) {
  const pieces = [
    `${client.name} completed ${data.sessions.length} coaching session${data.sessions.length === 1 ? '' : 's'} and ${data.vods.length} VOD review${data.vods.length === 1 ? '' : 's'} during ${data.range.label}.`,
  ];
  if (data.trainingDays) pieces.push(`Aim training was recorded on ${data.trainingDays} day${data.trainingDays === 1 ? '' : 's'} across ${data.trainingRuns} runs.`);
  if (data.homeworkAssigned) pieces.push(`${data.homeworkDone} of ${data.homeworkAssigned} assigned homework items are complete.`);
  if (data.record.total) pieces.push(`The logged match record was ${data.record.w}-${data.record.l}-${data.record.d} (${data.record.winrate}% win rate).`);
  return pieces.join(' ');
};

MonthlyReports.list = function (text) {
  const rows = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return rows.length ? `<ul>${rows.map(row => `<li>${UI.escape(row)}</li>`).join('')}</ul>` : '<p class="lead">None recorded.</p>';
};

MonthlyReports.open = function (clientId) {
  const c = getClient(clientId);
  const month = document.getElementById('monthly-report-month')?.value || UI.today().slice(0, 7);
  const current = MonthlyReports.data(clientId, month);
  const previous = MonthlyReports.data(clientId, current.range.previous);
  const draft = (c.monthlyReports || {})[current.range.key] || {};
  UI.modal(`
    <div class="modal-head"><div><h2>${UI.escape(current.range.label)} Progress Report</h2><div class="muted" style="font-size:.76rem">${UI.escape(c.name)} - compared with ${UI.escape(previous.range.label)}</div></div><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="stat-tiles mb">
      ${MonthlyReports.uiMetric('Sessions', current.sessions.length, previous.sessions.length)}
      ${MonthlyReports.uiMetric('Training days', current.trainingDays, previous.trainingDays)}
      ${MonthlyReports.uiMetric('VOD reviews', current.vods.length, previous.vods.length)}
      ${MonthlyReports.uiMetric('Homework complete', current.homeworkRate, previous.homeworkRate, '%')}
      ${MonthlyReports.uiMetric('Logged win rate', current.record.total ? current.record.winrate : null, previous.record.total ? previous.record.winrate : null, '%')}
      ${MonthlyReports.uiMetric('PR improvements', current.prImprovements, previous.prImprovements)}
    </div>
    <label class="field"><span>Coach summary</span><textarea id="mr-summary" placeholder="What changed this month and why?">${UI.escape(draft.summary || '')}</textarea></label>
    <label class="field"><span>Key wins (one per line)</span><textarea id="mr-wins" placeholder="Improved trade discipline&#10;Completed the weekly VOD routine">${UI.escape(draft.wins || '')}</textarea></label>
    <label class="field"><span>Next-month priorities (one per line)</span><textarea id="mr-priorities" placeholder="Raise training consistency&#10;Review defensive opening fights">${UI.escape(draft.priorities || '')}</textarea></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="MonthlyReports.exportFromModal('${clientId}','${current.range.key}')">Save &amp; Export PDF</button></div>`, { wide: true });
};

MonthlyReports.build = function (clientId, month, draftOverride) {
  const c = getClient(clientId);
  const current = MonthlyReports.data(clientId, month);
  const previous = MonthlyReports.data(clientId, current.range.previous);
  const draft = draftOverride || (c.monthlyReports || {})[current.range.key] || {};
  const plan = Plans.current(c);
  const summary = draft.summary || MonthlyReports.autoSummary(c, current);
  const trackerRow = (key, label, suffix = '') => {
    const now = current.tracker && current.tracker[key] != null ? +current.tracker[key] : null;
    const before = previous.tracker && previous.tracker[key] != null ? +previous.tracker[key] : null;
    return `<tr><td>${label}</td><td>${before == null ? '-' : before + suffix}</td><td>${now == null ? '-' : now + suffix}</td><td>${MonthlyReports.delta(now, before, suffix)}</td></tr>`;
  };

  const body = `
    ${Reports.headRow(c, `${current.range.label} Progress Report`)}
    <div class="report-callout">${UI.escape(summary).replace(/\n/g, '<br>')}</div>
    <h2>Month at a Glance</h2>
    <div class="metric-grid">
      ${MonthlyReports.pdfMetric('Coaching sessions', current.sessions.length, previous.sessions.length)}
      ${MonthlyReports.pdfMetric('Coaching minutes', current.sessionMinutes, previous.sessionMinutes, 'm')}
      ${MonthlyReports.pdfMetric('Training days', current.trainingDays, previous.trainingDays)}
      ${MonthlyReports.pdfMetric('VOD reviews', current.vods.length, previous.vods.length)}
      ${MonthlyReports.pdfMetric('Homework complete', current.homeworkRate, previous.homeworkRate, '%')}
      ${MonthlyReports.pdfMetric('Logged win rate', current.record.total ? current.record.winrate : null, previous.record.total ? previous.record.winrate : null, '%')}
    </div>
    <h2>Coaching Delivery</h2>
    <table><thead><tr><th>Metric</th><th>${UI.escape(previous.range.label)}</th><th>${UI.escape(current.range.label)}</th><th>Change</th></tr></thead><tbody>
      <tr><td>Sessions</td><td>${previous.sessions.length}</td><td>${current.sessions.length}</td><td>${MonthlyReports.delta(current.sessions.length, previous.sessions.length)}</td></tr>
      <tr><td>Coaching / prep minutes</td><td>${previous.sessionMinutes} / ${previous.prepMinutes}</td><td>${current.sessionMinutes} / ${current.prepMinutes}</td><td>${MonthlyReports.delta(current.sessionMinutes, previous.sessionMinutes, 'm')}</td></tr>
      <tr><td>VOD reviews / notes</td><td>${previous.vods.length} / ${previous.vodNotes}</td><td>${current.vods.length} / ${current.vodNotes}</td><td>${MonthlyReports.delta(current.vods.length, previous.vods.length)}</td></tr>
      <tr><td>Homework completed</td><td>${previous.homeworkDone}/${previous.homeworkAssigned}</td><td>${current.homeworkDone}/${current.homeworkAssigned}</td><td>${MonthlyReports.delta(current.homeworkRate, previous.homeworkRate, '%')}</td></tr>
      <tr><td>Goal check-ins / prescriptions</td><td>${previous.goalCheckins} / ${previous.prescriptionCompletions}</td><td>${current.goalCheckins} / ${current.prescriptionCompletions}</td><td>${MonthlyReports.delta(current.goalCheckins, previous.goalCheckins)}</td></tr>
    </tbody></table>
    <h2>Training and Match Performance</h2>
    <table><thead><tr><th>Metric</th><th>${UI.escape(previous.range.label)}</th><th>${UI.escape(current.range.label)}</th><th>Change</th></tr></thead><tbody>
      <tr><td>Training days / runs</td><td>${previous.trainingDays} / ${previous.trainingRuns}</td><td>${current.trainingDays} / ${current.trainingRuns}</td><td>${MonthlyReports.delta(current.trainingDays, previous.trainingDays)}</td></tr>
      <tr><td>PR improvements</td><td>${previous.prImprovements}</td><td>${current.prImprovements}</td><td>${MonthlyReports.delta(current.prImprovements, previous.prImprovements)}</td></tr>
      <tr><td>Logged matches</td><td>${previous.record.total}</td><td>${current.record.total}</td><td>${MonthlyReports.delta(current.record.total, previous.record.total)}</td></tr>
      <tr><td>Logged win rate</td><td>${previous.record.total ? previous.record.winrate + '%' : '-'}</td><td>${current.record.total ? current.record.winrate + '%' : '-'}</td><td>${MonthlyReports.delta(current.record.total ? current.record.winrate : null, previous.record.total ? previous.record.winrate : null, '%')}</td></tr>
      ${trackerRow('winRate', 'Profile win rate', '%')}
      ${trackerRow('headshotPct', 'Weapon accuracy', '%')}
      ${trackerRow('kd', 'Eliminations / 10')}
      ${trackerRow('adr', 'Damage / 10')}
      ${trackerRow('acs', 'Healing / 10')}
    </tbody></table>
    <div class="grid2">
      <div><h2>Key Wins</h2>${MonthlyReports.list(draft.wins)}</div>
      <div><h2>Next-Month Priorities</h2>${MonthlyReports.list(draft.priorities)}</div>
    </div>
    ${plan ? `<h2>Active Development Plan</h2><h3>${UI.escape(plan.title)}</h3>
      ${(plan.goals || []).length ? `<table><thead><tr><th>Outcome</th><th>Current</th><th>Target</th><th>Progress</th></tr></thead><tbody>${plan.goals.map(goal => {
        const metric = PLAN_METRICS[goal.metricKey] || PLAN_METRICS.custom;
        const unit = goal.unit || metric.unit || '';
        return `<tr><td>${UI.escape(goal.title)}</td><td>${Plans.fmt(goal.current)}${UI.escape(unit)}</td><td>${Plans.fmt(goal.target)}${UI.escape(unit)}</td><td>${Plans.goalProgress(goal)}%</td></tr>`;
      }).join('')}</tbody></table>` : ''}` : ''}
    ${current.sessions.length ? `<h2>Sessions This Month</h2><table><thead><tr><th>Date</th><th>Duration</th><th>Topics</th></tr></thead><tbody>${current.sessions.map(s => `<tr><td>${UI.fmtDate(s.date)}</td><td>${s.durationMin || 0}m</td><td>${UI.escape(s.topics || '-')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${current.vods.length ? `<h2>VOD Reviews This Month</h2><table><thead><tr><th>Date</th><th>Review</th><th>Notes</th></tr></thead><tbody>${current.vods.map(v => `<tr><td>${UI.fmtDate(v.date)}</td><td>${UI.escape(v.title)}</td><td>${(v.notes || []).length}</td></tr>`).join('')}</tbody></table>` : ''}`;

  const filename = `${c.name} - ${current.range.label} Progress`.replace(/[^\w\- ]+/g, '').slice(0, 70) + '.pdf';
  return { filename, html: Reports.shell(`${current.range.label} Progress Report`, body), data: current, previous };
};

MonthlyReports.exportFromModal = function (clientId, month) {
  const c = getClient(clientId);
  const draft = {
    summary: document.getElementById('mr-summary').value.trim(),
    wins: document.getElementById('mr-wins').value.trim(),
    priorities: document.getElementById('mr-priorities').value.trim(),
    updatedAt: new Date().toISOString(),
  };
  c.monthlyReports ||= {};
  c.monthlyReports[month] = draft;
  saveDB();
  const report = MonthlyReports.build(clientId, month, draft);
  UI.closeModal();
  Reports.export(report.filename, report.html);
};

MonthlyReports.originalRenderer = UI.renderers.reports;
UI.renderers.reports = function (el) {
  MonthlyReports.originalRenderer(el);
  const c = activeClient();
  const grid = el.querySelector('.grid.cols-2');
  if (!c || !grid) return;
  grid.insertAdjacentHTML('afterbegin', `
    <div class="card monthly-report-card">
      <div class="card-head"><h2>Monthly Progress Report</h2><span class="pill">Month over month</span></div>
      <p class="muted" style="font-size:.84rem">Compare coaching delivery, practice consistency, homework, matches, development activity, and Overwatch profile snapshots with the previous month.</p>
      <div class="flex gap-sm center wrap mt-sm">
        <input id="monthly-report-month" type="month" value="${UI.today().slice(0, 7)}" style="width:auto">
        <button class="btn btn-primary" onclick="MonthlyReports.open('${c.id}')">Review &amp; Export PDF</button>
      </div>
    </div>`);
};





