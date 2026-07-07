/* =============================================================================
   COACH ANALYTICS -roster economics, retention signals, delivery efficiency,
   and evidence about which coaching programs are producing follow-through.
   ============================================================================= */
const CoachAnalytics = {};

CoachAnalytics.range = '90';
CoachAnalytics.money = n => '$' + UI.fmtNumber(Math.round((+n || 0) * 100) / 100);
CoachAnalytics.percent = n => n == null ? '-' : `${Math.round(n)}%`;
CoachAnalytics.date = value => value ? new Date(value.slice(0, 10) + 'T12:00:00') : null;
CoachAnalytics.daysBetween = function (a, b) {
  const start = CoachAnalytics.date(a), end = CoachAnalytics.date(b);
  return start && end ? Math.max(0, Math.floor((end - start) / 86400000)) : 0;
};
CoachAnalytics.startDate = function (days = CoachAnalytics.range) {
  if (days === 'all') return '';
  const d = CoachAnalytics.date(UI.today());
  d.setDate(d.getDate() - Math.max(1, +days || 90) + 1);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
CoachAnalytics.inRange = function (value, start = CoachAnalytics.startDate()) {
  const date = (value || '').slice(0, 10);
  return !!date && (!start || date >= start) && date <= UI.today();
};
CoachAnalytics.lastActivity = function (clientId) {
  const event = typeof Timeline !== 'undefined' ? Timeline.build(clientId)[0] : null;
  return event ? event.date : '';
};
CoachAnalytics.planExpected = function (plan) {
  const start = (plan.startDate || plan.createdAt || '').slice(0, 10);
  if (!start) return 0;
  const end = plan.status === 'completed' && plan.completedAt
    ? plan.completedAt.slice(0, 10)
    : (plan.endDate && plan.endDate < UI.today() ? plan.endDate : UI.today());
  const weeks = Math.max(1, Math.ceil((CoachAnalytics.daysBetween(start, end) + 1) / 7));
  return (plan.actions || []).reduce((sum, action) => sum + Math.max(1, +action.targetPerWeek || 1) * weeks, 0);
};
CoachAnalytics.planCompleted = plan => (plan.actions || []).reduce((sum, action) => sum + (action.completions || []).length, 0);

CoachAnalytics.monthKeys = function (count = 6) {
  const base = CoachAnalytics.date(UI.today());
  base.setDate(1);
  const rows = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setMonth(d.getMonth() - i);
    rows.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return rows;
};

CoachAnalytics.data = function () {
  const start = CoachAnalytics.startDate();
  const sessions = (DB.sessions || []).filter(s => CoachAnalytics.inRange(s.date || s.createdAt, start));
  const packages = DB.clients.flatMap(c => (c.packages || []).map(p => ({
    ...p, clientId: c.id, packageDate: (p.date || p.createdAt || '').slice(0, 10),
  }))).filter(p => CoachAnalytics.inRange(p.packageDate, start));
  const paid = packages.filter(p => p.paid);
  const revenue = paid.reduce((sum, p) => sum + (+p.price || 0), 0);
  const outstanding = packages.filter(p => !p.paid).reduce((sum, p) => sum + (+p.price || 0), 0);
  const hours = sessions.reduce((sum, s) => sum + (+s.durationMin || 0), 0) / 60;
  const prepSessions = sessions.filter(s => +s.prepMinutes > 0);
  const prepMinutes = prepSessions.reduce((sum, s) => sum + (+s.prepMinutes || 0), 0);

  const thirtyDaysAgo = (() => {
    const d = CoachAnalytics.date(UI.today()); d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const sevenDaysAgo = (() => {
    const d = CoachAnalytics.date(UI.today()); d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const matureClients = DB.clients.filter(c => (c.createdAt || '').slice(0, 10) && (c.createdAt || '').slice(0, 10) <= thirtyDaysAgo);
  const active30 = DB.clients.filter(c => CoachAnalytics.lastActivity(c.id) >= thirtyDaysAgo);
  const active7 = DB.clients.filter(c => CoachAnalytics.lastActivity(c.id) >= sevenDaysAgo);
  const retainedMature = matureClients.filter(c => CoachAnalytics.lastActivity(c.id) >= thirtyDaysAgo);
  const packageClients = DB.clients.filter(c => (c.packages || []).length > 0);
  const renewedClients = packageClients.filter(c => (c.packages || []).length > 1);
  const sessionClients = DB.clients.filter(c => clientSessions(c.id).length > 0);
  const repeatClients = sessionClients.filter(c => clientSessions(c.id).length > 1);

  const programMap = {};
  DB.clients.forEach(c => (c.developmentPlans || []).forEach(plan => {
    const key = (plan.title || 'Untitled development plan').trim().toLowerCase();
    const row = programMap[key] ||= { title: plan.title || 'Untitled development plan', cycles: 0, clients: new Set(), progress: 0, completedCycles: 0, expected: 0, completed: 0 };
    row.cycles++; row.clients.add(c.id);
    row.progress += typeof Plans !== 'undefined' ? Plans.planProgress(plan) : 0;
    if (plan.status === 'completed') row.completedCycles++;
    row.expected += CoachAnalytics.planExpected(plan);
    row.completed += CoachAnalytics.planCompleted(plan);
  }));
  const programs = Object.values(programMap).map(row => {
    const outcome = row.cycles ? row.progress / row.cycles : 0;
    const adherence = row.expected ? Math.min(100, row.completed / row.expected * 100) : null;
    const score = adherence == null ? outcome : outcome * .7 + adherence * .3;
    return { ...row, clientCount: row.clients.size, outcome, adherence, score };
  }).sort((a, b) => b.score - a.score);

  const homeworkMap = {};
  sessions.forEach(s => (s.homework || []).forEach(h => {
    const key = h.type || 'other';
    const row = homeworkMap[key] ||= { key, assigned: 0, done: 0 };
    row.assigned++; if (h.done) row.done++;
  }));
  const homework = Object.values(homeworkMap).map(row => ({
    ...row, completion: row.assigned ? row.done / row.assigned * 100 : 0,
  })).sort((a, b) => b.completion - a.completion || b.assigned - a.assigned);

  const prescriptionMap = {};
  DB.clients.forEach(c => (c.developmentPlans || []).forEach(plan => (plan.actions || []).forEach(action => {
    const key = action.type || 'Other';
    const row = prescriptionMap[key] ||= { key, expected: 0, done: 0 };
    const planExpected = CoachAnalytics.planExpected({ ...plan, actions: [action] });
    row.expected += planExpected;
    row.done += (action.completions || []).length;
  })));
  const prescriptions = Object.values(prescriptionMap).map(row => ({
    ...row, adherence: row.expected ? Math.min(100, row.done / row.expected * 100) : 0,
  })).sort((a, b) => b.adherence - a.adherence || b.done - a.done);

  const clients = DB.clients.map(c => {
    const clientPackages = packages.filter(p => p.clientId === c.id);
    const clientSessionsInRange = sessions.filter(s => s.clientId === c.id);
    const clientHours = clientSessionsInRange.reduce((sum, s) => sum + (+s.durationMin || 0), 0) / 60;
    const clientRevenue = clientPackages.filter(p => p.paid).reduce((sum, p) => sum + (+p.price || 0), 0);
    const clientPrep = clientSessionsInRange.filter(s => +s.prepMinutes > 0);
    return {
      client: c, revenue: clientRevenue, hours: clientHours,
      revenuePerHour: clientHours ? clientRevenue / clientHours : null,
      sessions: clientSessionsInRange.length,
      avgPrep: clientPrep.length ? clientPrep.reduce((sum, s) => sum + (+s.prepMinutes || 0), 0) / clientPrep.length : null,
      packages: (c.packages || []).length, lastActivity: CoachAnalytics.lastActivity(c.id),
    };
  }).sort((a, b) => b.revenue - a.revenue || b.hours - a.hours);

  const months = CoachAnalytics.monthKeys(6).map(key => ({
    key,
    label: CoachAnalytics.date(key + '-01').toLocaleDateString(UI.LOCALE, { month: 'short' }),
    revenue: paid.filter(p => p.packageDate.startsWith(key)).reduce((sum, p) => sum + (+p.price || 0), 0),
    hours: sessions.filter(s => (s.date || '').startsWith(key)).reduce((sum, s) => sum + (+s.durationMin || 0), 0) / 60,
    sessions: sessions.filter(s => (s.date || '').startsWith(key)).length,
  }));

  const upcoming14 = (DB.scheduled || []).filter(s => !s.done && s.date >= UI.today() && s.date <= (typeof Today !== 'undefined' ? Today.addDays(UI.today(), 14) : UI.today())).length;
  return {
    start, sessions, packages, revenue, outstanding, hours, prepMinutes,
    avgPrep: prepSessions.length ? prepMinutes / prepSessions.length : null,
    revenuePerHour: hours ? revenue / hours : null,
    retention: matureClients.length ? retainedMature.length / matureClients.length * 100 : null,
    renewal: packageClients.length ? renewedClients.length / packageClients.length * 100 : null,
    repeatRate: sessionClients.length ? repeatClients.length / sessionClients.length * 100 : null,
    matureCount: matureClients.length, active7: active7.length, active30: active30.length,
    programs, homework, prescriptions, clients, months, upcoming14,
  };
};

CoachAnalytics.setRange = function (range) {
  CoachAnalytics.range = range;
  UI.refresh();
};
CoachAnalytics.bar = function (value, max, kind) {
  const width = max ? Math.max(value ? 3 : 0, Math.min(100, value / max * 100)) : 0;
  return `<div class="coach-bar"><div class="${kind}" style="width:${width}%"></div></div>`;
};
CoachAnalytics.empty = text => `<div class="today-empty">${UI.escape(text)}</div>`;

UI.renderers.coachanalytics = function (el) {
  const d = CoachAnalytics.data();
  const maxRevenue = Math.max(0, ...d.months.map(x => x.revenue));
  const maxHours = Math.max(0, ...d.months.map(x => x.hours));
  const rangeLabel = CoachAnalytics.range === 'all' ? 'All time' : `Last ${CoachAnalytics.range} days`;

  const monthHtml = d.months.map(m => `<div class="coach-month">
    <div class="coach-month-label">${m.label}</div>
    <div class="coach-month-bars">
      <div><span>${CoachAnalytics.money(m.revenue)}</span>${CoachAnalytics.bar(m.revenue, maxRevenue, 'revenue')}</div>
      <div><span>${Math.round(m.hours * 10) / 10}h</span>${CoachAnalytics.bar(m.hours, maxHours, 'hours')}</div>
    </div>
  </div>`).join('');

  const programHtml = d.programs.length ? `<table class="data"><thead><tr><th>Program</th><th>Clients</th><th>Cycles</th><th>Outcome</th><th>Adherence</th><th>Effectiveness</th></tr></thead><tbody>
    ${d.programs.map(p => `<tr><td><b>${UI.escape(p.title)}</b><div class="muted" style="font-size:.68rem">${p.completedCycles} completed cycle${p.completedCycles === 1 ? '' : 's'}</div></td><td>${p.clientCount}</td><td>${p.cycles}</td><td>${CoachAnalytics.percent(p.outcome)}</td><td>${CoachAnalytics.percent(p.adherence)}</td><td><b class="text-accent">${Math.round(p.score)}</b></td></tr>`).join('')}
    </tbody></table>` : CoachAnalytics.empty('Development plans will appear here once cycles are created.');

  const homeworkHtml = d.homework.length ? d.homework.map(h => `<div class="coach-rate-row">
    <div><b>${UI.escape(typeof HW_TYPES !== 'undefined' ? (HW_TYPES[h.key] || h.key) : h.key)}</b><small>${h.done}/${h.assigned} completed</small></div>
    <div class="coach-rate"><span>${CoachAnalytics.percent(h.completion)}</span>${CoachAnalytics.bar(h.completion, 100, 'good')}</div>
  </div>`).join('') : CoachAnalytics.empty(`No homework assignments in ${rangeLabel.toLowerCase()}.`);

  const prescriptionHtml = d.prescriptions.length ? d.prescriptions.map(p => `<div class="coach-rate-row">
    <div><b>${UI.escape(p.key)}</b><small>${p.done}/${p.expected} expected completions</small></div>
    <div class="coach-rate"><span>${CoachAnalytics.percent(p.adherence)}</span>${CoachAnalytics.bar(p.adherence, 100, 'accent')}</div>
  </div>`).join('') : CoachAnalytics.empty('Weekly prescriptions will appear here with development plans.');

  const clientHtml = d.clients.length ? `<div class="coach-table-wrap"><table class="data"><thead><tr><th>Client</th><th>Revenue</th><th>Sessions</th><th>Hours</th><th>Revenue / hour</th><th>Avg prep</th><th>Packages</th><th>Last activity</th><th></th></tr></thead><tbody>
    ${d.clients.map(row => `<tr><td><b>${UI.escape(row.client.name)}</b></td><td>${CoachAnalytics.money(row.revenue)}</td><td>${row.sessions}</td><td>${Math.round(row.hours * 10) / 10}h</td><td>${row.revenuePerHour == null ? '-' : CoachAnalytics.money(row.revenuePerHour)}</td><td>${row.avgPrep == null ? '-' : Math.round(row.avgPrep) + 'm'}</td><td>${row.packages}${row.packages > 1 ? ' <span class="pill good">renewed</span>' : ''}</td><td class="muted">${row.lastActivity ? UI.fmtDate(row.lastActivity) : '-'}</td><td><button class="btn btn-xs" onclick="Today.go('${row.client.id}','dashboard')">Open</button></td></tr>`).join('')}
    </tbody></table></div>` : CoachAnalytics.empty('Add clients to see unit economics.');

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Coach Analytics</h1><div class="sub">Business health, delivery efficiency, retention signals, and evidence about what works.</div></div>
      <div class="flex gap-sm center"><div class="seg">${[['30', '30d'], ['90', '90d'], ['365', '1y'], ['all', 'All']].map(([value, label]) => `<button class="${CoachAnalytics.range === value ? 'on' : ''}" onclick="CoachAnalytics.setRange('${value}')">${label}</button>`).join('')}</div><button class="btn" onclick="CoachAnalytics.exportCsv()">Export CSV</button></div>
    </div>
    <div class="coach-range-note">${rangeLabel}${d.start ? ` - since ${UI.fmtDate(d.start)}` : ''}</div>
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">Collected revenue</div><div class="value text-good">${CoachAnalytics.money(d.revenue)}</div><small>${d.outstanding ? CoachAnalytics.money(d.outstanding) + ' outstanding' : 'Nothing outstanding'}</small></div>
      <div class="stat-tile"><div class="label">Revenue / coached hour</div><div class="value accent">${d.revenuePerHour == null ? '-' : CoachAnalytics.money(d.revenuePerHour)}</div><small>${Math.round(d.hours * 10) / 10} delivered hours</small></div>
      <div class="stat-tile"><div class="label">30-day retention signal</div><div class="value">${CoachAnalytics.percent(d.retention)}</div><small>${d.matureCount ? 'Established clients still active' : 'Needs clients older than 30 days'}</small></div>
      <div class="stat-tile"><div class="label">Package renewal rate</div><div class="value">${CoachAnalytics.percent(d.renewal)}</div><small>Clients buying a second package</small></div>
      <div class="stat-tile"><div class="label">Average session prep</div><div class="value">${d.avgPrep == null ? '-' : Math.round(d.avgPrep) + 'm'}</div><small>${d.prepMinutes} tracked minutes</small></div>
      <div class="stat-tile"><div class="label">Repeat session rate</div><div class="value">${CoachAnalytics.percent(d.repeatRate)}</div><small>${d.upcoming14} sessions in next 14 days</small></div>
    </div>
    <div class="grid cols-2 mb">
      <div class="card"><div class="card-head"><h2>Revenue and delivery trend</h2><div class="coach-legend"><span class="revenue"></span>Revenue <span class="hours"></span>Hours</div></div><div class="coach-months">${monthHtml}</div></div>
      <div class="card"><div class="card-head"><h2>Roster engagement</h2><span class="muted" style="font-size:.72rem">Current roster</span></div>
        <div class="coach-engagement">
          <div><span>Active in 7 days</span><b>${d.active7} / ${DB.clients.length}</b>${CoachAnalytics.bar(d.active7, DB.clients.length, 'good')}</div>
          <div><span>Active in 30 days</span><b>${d.active30} / ${DB.clients.length}</b>${CoachAnalytics.bar(d.active30, DB.clients.length, 'accent')}</div>
          <div><span>Upcoming workload</span><b>${d.upcoming14} sessions</b>${CoachAnalytics.bar(d.upcoming14, Math.max(1, DB.clients.length * 2), 'hours')}</div>
        </div>
      </div>
    </div>
    <div class="card mb"><div class="card-head"><h2>Most effective development programs</h2><span class="muted" style="font-size:.7rem">70% outcome progress - 30% prescription adherence</span></div>${programHtml}</div>
    <div class="grid cols-2 mb">
      <div class="card"><div class="card-head"><h2>Homework follow-through</h2><span class="muted" style="font-size:.72rem">${rangeLabel}</span></div>${homeworkHtml}</div>
      <div class="card"><div class="card-head"><h2>Prescription adherence</h2><span class="muted" style="font-size:.72rem">Across development cycles</span></div>${prescriptionHtml}</div>
    </div>
    <div class="card mb"><div class="card-head"><h2>Client economics</h2><span class="muted" style="font-size:.72rem">${rangeLabel}</span></div>${clientHtml}</div>
    <div class="coach-definitions"><b>How these numbers work:</b> Revenue uses paid packages dated inside the selected range. Retention is an engagement signal - not a cancellation metric - and counts clients older than 30 days with activity in the last 30 days. Renewal counts clients with two or more packages. Effectiveness combines measured goal progress and expected weekly prescription completion.</div>`;
};

CoachAnalytics.exportCsv = function () {
  const d = CoachAnalytics.data();
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['Client', 'Revenue', 'Sessions', 'Coached hours', 'Revenue per hour', 'Average prep minutes', 'Packages', 'Last activity'],
    ...d.clients.map(row => [
      row.client.name, row.revenue, row.sessions, Math.round(row.hours * 100) / 100,
      row.revenuePerHour == null ? '' : Math.round(row.revenuePerHour * 100) / 100,
      row.avgPrep == null ? '' : Math.round(row.avgPrep), row.packages, row.lastActivity,
    ]),
  ];
  const csv = rows.map(row => row.map(quote).join(',')).join('\r\n');
  const bytes = new TextEncoder().encode(csv);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  window.api.saveFile(`KovaaK's Coach Analytics - ${UI.today()}.csv`, `data:text/csv;base64,${btoa(binary)}`)
    .then(result => UI.toast(result && result.success ? 'Analytics CSV saved.' : (result && result.msg) || 'Export cancelled.', result && result.success ? 'good' : 'bad'));
};



