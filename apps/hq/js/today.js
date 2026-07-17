/* =============================================================================
   TODAY -roster-wide coaching command center and explainable client priorities.
   ============================================================================= */
const Today = {};

Today.INACTIVE_DAYS = 7;
Today.STALLED_DAYS = 14;
Today.UPCOMING_DAYS = 14;

Today.date = function (value) {
  const text = (value || '').slice(0, 10);
  return text ? new Date(text + 'T12:00:00') : null;
};
Today.addDays = function (value, days) {
  const d = Today.date(value);
  d.setDate(d.getDate() + days);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
Today.daysSince = function (value) {
  const d = Today.date(value);
  const now = Today.date(UI.today());
  return d ? Math.max(0, Math.floor((now - d) / 86400000)) : null;
};
Today.vodStatus = v => typeof Vods !== 'undefined' ? Vods.status(v) : (v.reviewStatus || ((v.notes || []).length ? 'complete' : 'inbox'));

Today.homework = function () {
  return (DB.sessions || []).flatMap(s => (s.homework || []).map(h => ({
    ...h, sessionId: s.id, clientId: s.clientId, assignedDate: s.date,
  })));
};

Today.lastActivity = function (c) {
  const event = typeof Timeline !== 'undefined' ? Timeline.build(c.id)[0] : null;
  return (event && event.date) || (c.createdAt || '').slice(0, 10) || '';
};

Today.stalledGoals = function () {
  const rows = [];
  DB.clients.forEach(c => {
    const plan = typeof Plans !== 'undefined' ? Plans.current(c) : null;
    if (plan) {
      (plan.goals || []).forEach(g => {
        if (Plans.goalProgress(g) >= 100) return;
        const history = (g.history || []).map(x => x.date).filter(Boolean).sort();
        const last = history.at(-1) || (plan.startDate || '').slice(0, 10) || (plan.createdAt || '').slice(0, 10);
        const days = Today.daysSince(last);
        if (days != null && days >= Today.STALLED_DAYS) {
          rows.push({ clientId: c.id, client: c, title: g.title || 'Development outcome', plan, last, days, progress: Plans.goalProgress(g) });
        }
      });
    }
    (c.goals || []).filter(g => !g.done && g.createdAt).forEach(g => {
      const last = g.updatedAt || (g.createdAt || '').slice(0, 10);
      const days = Today.daysSince(last);
      if (days != null && days >= Today.STALLED_DAYS) {
        rows.push({ clientId: c.id, client: c, title: g.text, last, days, progress: null });
      }
    });
  });
  return rows.sort((a, b) => b.days - a.days);
};

Today.snapshot = function () {
  const today = UI.today();
  const horizon = Today.addDays(today, Today.UPCOMING_DAYS);
  // Respects the "My clients only" toggle on the Clients tab, so a coach on
  // a multi-coach team doesn't get paged about every other coach's roster.
  const roster = Clients.visibleClients();
  const visibleIds = new Set(roster.map(c => c.id));
  const homework = Today.homework().filter(h => visibleIds.has(h.clientId));
  const overdueHomework = homework.filter(h => !h.done && h.dueDate && h.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcomingSessions = (DB.scheduled || []).filter(s => !s.done && s.date >= today && s.date <= horizon && visibleIds.has(s.clientId))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const unreviewedVods = (DB.vods || []).filter(v => Today.vodStatus(v) !== 'complete' && visibleIds.has(v.clientId))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const inactivePlayers = roster.map(c => {
    const last = Today.lastActivity(c);
    return { client: c, clientId: c.id, last, days: Today.daysSince(last) };
  }).filter(x => x.days == null || x.days >= Today.INACTIVE_DAYS)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  // A reminder with no clientId is a general/roster-wide follow-up, not tied
  // to one player, so it isn't affected by the client filter.
  const reminders = (DB.reminders || []).filter(r => !r.done && r.dueDate <= horizon && (!r.clientId || visibleIds.has(r.clientId)))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const stalledGoals = Today.stalledGoals().filter(g => visibleIds.has(g.clientId));
  const sessionRequests = DB.clients.flatMap(c => (c.sessionRequests || [])
    .filter(r => r.status === 'open')
    .map(r => ({ ...r, clientId: c.id, client: c })))
    .filter(r => visibleIds.has(r.clientId))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return { today, homework, overdueHomework, upcomingSessions, unreviewedVods, inactivePlayers, reminders, stalledGoals, sessionRequests };
};

Today.priorityFor = function (c, snap) {
  let score = Math.max(0, Math.min(10, +c.priority || 0));
  const reasons = [];
  const sessions = snap.upcomingSessions.filter(s => s.clientId === c.id);
  const todaySession = sessions.find(s => s.date === snap.today);
  if (todaySession) { score += 40; reasons.push('Session today +40'); }
  else if (sessions.some(s => s.date <= Today.addDays(snap.today, 3))) { score += 20; reasons.push('Session within 3 days +20'); }

  const overdue = snap.overdueHomework.filter(h => h.clientId === c.id).length;
  if (overdue) {
    const points = Math.min(30, overdue * 15);
    score += points; reasons.push(`${overdue} overdue homework +${points}`);
  }
  const dueFollowups = snap.reminders.filter(r => r.clientId === c.id && r.dueDate <= snap.today).length;
  if (dueFollowups) {
    const points = Math.min(30, dueFollowups * 15);
    score += points; reasons.push(`${dueFollowups} follow-up${dueFollowups === 1 ? '' : 's'} due +${points}`);
  }
  const inactive = snap.inactivePlayers.find(x => x.clientId === c.id);
  if (inactive) {
    const points = inactive.days == null ? 25 : Math.min(25, inactive.days);
    score += points; reasons.push(`${inactive.days == null ? 'No' : inactive.days + 'd since'} activity +${points}`);
  }
  const vods = snap.unreviewedVods.filter(v => v.clientId === c.id).length;
  if (vods) {
    const points = Math.min(20, vods * 10);
    score += points; reasons.push(`${vods} VOD${vods === 1 ? '' : 's'} to review +${points}`);
  }
  const stalled = snap.stalledGoals.filter(g => g.clientId === c.id).length;
  if (stalled) {
    const points = Math.min(30, stalled * 15);
    score += points; reasons.push(`${stalled} stalled goal${stalled === 1 ? '' : 's'} +${points}`);
  }
  if (+c.priority > 0) reasons.push(`Coach priority +${Math.min(10, +c.priority)}`);
  return { client: c, score, reasons };
};

Today.priorities = snap => Clients.visibleClients().map(c => Today.priorityFor(c, snap))
  .sort((a, b) => b.score - a.score || a.client.name.localeCompare(b.client.name));

Today.activate = function (clientId) {
  DB.activeClientId = clientId;
  saveDB();
  UI.updateClientPill();
};
Today.go = function (clientId, view) {
  Today.activate(clientId);
  App.nav(view);
};
Today.openVod = function (clientId, vodId) {
  Today.activate(clientId);
  Vods.open(vodId);
};

Today.empty = text => `<div class="today-empty">${UI.escape(text)}</div>`;
Today.clientButton = (client, view = 'dashboard') => `<button class="today-client" onclick="Today.go('${client.id}','${view}')">${UI.escape(client.name)}</button>`;
Today.when = function (date, time) {
  const prefix = date === UI.today() ? 'Today' : UI.fmtDate(date);
  return `${prefix}${time ? ' - ' + UI.escape(time) : ''}`;
};

Today.briefData = function (session, snap = Today.snapshot()) {
  const c = getClient(session.clientId);
  if (!c) return null;
  const plan = typeof Plans !== 'undefined' ? Plans.current(c) : null;
  const sessions = clientSessions(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const recentSessions = sessions.slice(0, 3);
  const matches = clientMatches(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const vods = clientVods(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const openHw = snap.homework.filter(h => h.clientId === c.id && !h.done)
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const overdueHw = openHw.filter(h => h.dueDate && h.dueDate < snap.today);
  const unreviewed = snap.unreviewedVods.filter(v => v.clientId === c.id);
  const stalled = snap.stalledGoals.filter(g => g.clientId === c.id);
  const dueReminders = snap.reminders.filter(r => r.clientId === c.id && r.dueDate <= session.date);
  const tracker = c.trackerStats || null;
  const recentVodNotes = vods.flatMap(v => (v.notes || []).map(n => ({
    vod: v, text: n.text || '', tag: n.tag || '', t: n.t || 0, date: v.date || v.createdAt || '',
  }))).filter(n => n.text).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const recentActivity = typeof Timeline !== 'undefined' ? Timeline.build(c.id).slice(0, 5) : [];
  const agenda = [];
  if (session.notes) agenda.push(`Planned focus: ${session.notes}`);
  if (plan) {
    const focus = (plan.focusAreas || []).join(', ') || plan.objective || plan.title;
    agenda.push(`Advance active plan: ${focus}`);
  }
  if (overdueHw.length) agenda.push(`Resolve ${overdueHw.length} overdue homework item${overdueHw.length === 1 ? '' : 's'}`);
  if (unreviewed.length) agenda.push(`Review or assign next step from ${unreviewed.length} queued VOD${unreviewed.length === 1 ? '' : 's'}`);
  if (stalled.length) agenda.push(`Unblock stalled outcome: ${stalled[0].title}`);
  if (matches.length) agenda.push(`Review recent match pattern: ${matches.map(m => `${m.result}${m.map ? ' ' + m.map : ''}`).slice(0, 3).join(', ')}`);
  if (!agenda.length) agenda.push('Confirm current goals, ranked context, and next measurable focus');
  const questions = [];
  if (openHw.length) questions.push(`What made "${openHw[0].text}" easy or hard to complete?`);
  if (unreviewed.length) questions.push(`Which moment from "${unreviewed[0].title}" felt most repeatable or most costly?`);
  if (plan && (plan.goals || []).length) questions.push(`What changed since the last check-in on "${plan.goals[0].title || plan.title}"?`);
  if (tracker) questions.push('Do the saved profile snapshot numbers still match how the player feels in ranked?');
  if (matches.some(m => m.result === 'Loss')) questions.push('What was the first fight or tempo mistake that started the losing pattern?');
  if (!questions.length) questions.push('What should feel different by the end of today\'s session?');
  return { client: c, session, plan, recentSessions, matches, vods, openHw, overdueHw, unreviewed, stalled, dueReminders, tracker, recentVodNotes, recentActivity, agenda, questions };
};

Today.briefMetric = (label, value, tone = '') => `<div class="prep-metric ${tone}"><span>${UI.escape(label)}</span><b>${UI.escape(value)}</b></div>`;

Today.briefMarkdown = function (sessionId) {
  const session = (DB.scheduled || []).find(s => s.id === sessionId);
  const data = session && Today.briefData(session);
  if (!data) return '';
  const lines = [
    `# Session Prep Brief - ${data.client.name}`,
    `${Today.when(data.session.date, data.session.time)}`,
    '',
    '## Recommended agenda',
    ...data.agenda.map(x => `- ${x}`),
    '',
    '## Prep checklist',
    `- Open homework: ${data.openHw.length}`,
    `- Overdue homework: ${data.overdueHw.length}`,
    `- Unreviewed VODs: ${data.unreviewed.length}`,
    `- Stalled goals: ${data.stalled.length}`,
    '',
    '## Questions to ask',
    ...data.questions.map(x => `- ${x}`),
  ];
  if (data.tracker) lines.push('', '## Profile snapshot', `- Win rate: ${data.tracker.winRate ?? '-'}%`, `- Weapon accuracy: ${data.tracker.headshotPct ?? '-'}%`, `- Rank: ${data.tracker.rank || '-'}`);
  if (data.recentVodNotes.length) lines.push('', '## Recent VOD notes', ...data.recentVodNotes.map(n => `- ${n.vod.title}: ${n.text}`));
  return lines.join('\n');
};

Today.copyBrief = function (sessionId) {
  const text = Today.briefMarkdown(sessionId);
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => UI.toast('Prep brief copied.', 'good'),
    () => UI.toast('Clipboard blocked. Select and copy the brief text manually.', 'bad'));
};

Today.openBrief = function (sessionId) {
  const session = (DB.scheduled || []).find(s => s.id === sessionId);
  const data = session && Today.briefData(session);
  if (!data) return;
  const E = UI.escape;
  const metricRow = `
    <div class="prep-metrics">
      ${Today.briefMetric('Open homework', String(data.openHw.length), data.openHw.length ? 'warn' : 'good')}
      ${Today.briefMetric('Overdue', String(data.overdueHw.length), data.overdueHw.length ? 'bad' : 'good')}
      ${Today.briefMetric('VOD queue', String(data.unreviewed.length), data.unreviewed.length ? 'warn' : 'good')}
      ${Today.briefMetric('Stalled goals', String(data.stalled.length), data.stalled.length ? 'bad' : 'good')}
    </div>`;
  const tracker = data.tracker ? `<div class="prep-section"><h3>Profile Snapshot</h3>
    <div class="prep-metrics compact">
      ${Today.briefMetric('Win rate', data.tracker.winRate == null ? '-' : data.tracker.winRate + '%')}
      ${Today.briefMetric('Accuracy', data.tracker.headshotPct == null ? '-' : data.tracker.headshotPct + '%')}
      ${Today.briefMetric('Rank', data.tracker.rank || '-')}
    </div>
    <p class="muted" style="font-size:.76rem;margin-top:.5rem">Recorded ${UI.fmtDate(data.tracker.updatedAt)}.</p></div>` : '';
  UI.modal(`
    <div class="modal-head"><h2>Session Prep Brief</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="prep-hero">
      <div><div class="today-kicker">${Today.when(data.session.date, data.session.time)}</div><h3>${E(data.client.name)}</h3><p>${E(data.session.notes || 'No scheduled focus captured yet.')}</p></div>
      <div class="flex gap-sm wrap"><button class="btn btn-sm" onclick="Today.go('${data.client.id}','dashboard')">Dashboard</button><button class="btn btn-sm" onclick="Business.scheduleEdit('${data.session.id}')">Edit session</button></div>
    </div>
    ${metricRow}
    <div class="grid cols-2">
      <div class="prep-section"><h3>Recommended Agenda</h3><ol>${data.agenda.map(x => `<li>${E(x)}</li>`).join('')}</ol></div>
      <div class="prep-section"><h3>Questions To Ask</h3><ol>${data.questions.map(x => `<li>${E(x)}</li>`).join('')}</ol></div>
    </div>
    ${tracker}
    <div class="grid cols-2">
      <div class="prep-section"><h3>Recent Signals</h3>
        ${data.recentActivity.length ? `<ul>${data.recentActivity.map(e => `<li><b>${E(e.kind)}</b> - ${E(e.text)} <span class="muted">${UI.fmtDate(e.date)}</span></li>`).join('')}</ul>` : '<p class="muted">No recent activity yet.</p>'}
      </div>
      <div class="prep-section"><h3>Homework And VOD Queue</h3>
        ${(data.openHw.length || data.unreviewed.length) ? `<ul>
          ${data.openHw.slice(0, 5).map(h => `<li>${h.dueDate && h.dueDate < data.session.date ? '<b class="text-bad">Overdue</b> - ' : ''}${E(h.text)}${h.dueDate ? ` <span class="muted">due ${UI.fmtDate(h.dueDate)}</span>` : ''}</li>`).join('')}
          ${data.unreviewed.slice(0, 3).map(v => `<li>VOD: ${E(v.title)} <span class="muted">${UI.fmtDate(v.date)}</span></li>`).join('')}
        </ul>` : '<p class="muted">No open homework or VOD reviews.</p>'}
      </div>
    </div>
    ${data.recentVodNotes.length ? `<div class="prep-section"><h3>Recent VOD Notes</h3><ul>${data.recentVodNotes.map(n => `<li><b>${E(n.vod.title)}</b> - ${E(n.text)}</li>`).join('')}</ul></div>` : ''}
    <label class="field"><span>Copyable brief</span><textarea readonly style="min-height:170px">${E(Today.briefMarkdown(data.session.id))}</textarea></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Close</button><button class="btn btn-primary" onclick="Today.copyBrief('${data.session.id}')">Copy brief</button></div>`, { wide: true });
};

Today.briefHtml = function (session, snap) {
  const c = getClient(session.clientId);
  if (!c) return '';
  const data = Today.briefData(session, snap);
  const logged = data.recentSessions[0];
  const focus = data.plan && (data.plan.focusAreas || []).length ? data.plan.focusAreas.join(', ') : (c.notes || 'No focus area captured');
  const topAgenda = data.agenda.slice(0, 2);
  return `<div class="today-brief">
    <div class="flex between center gap wrap">
      <div><span class="today-kicker">${Today.when(session.date, session.time)}</span><h3>${UI.escape(c.name)}</h3></div>
      <button class="btn btn-xs btn-primary" onclick="Today.openBrief('${session.id}')">Open prep brief</button>
    </div>
    ${session.notes ? `<div class="today-brief-line"><b>Planned:</b> ${UI.escape(session.notes)}</div>` : ''}
    <div class="today-brief-line"><b>Focus:</b> ${UI.escape(focus)}</div>
    <div class="today-brief-line"><b>Last session:</b> ${logged ? `${UI.fmtDate(logged.date)}${logged.topics ? ' - ' + UI.escape(logged.topics) : ''}` : 'No logged session yet'}</div>
    <div class="today-brief-line"><b>Auto-brief:</b> ${data.openHw.length} homework open - ${data.unreviewed.length} VOD${data.unreviewed.length === 1 ? '' : 's'} - ${data.stalled.length} stalled goal${data.stalled.length === 1 ? '' : 's'}</div>
    <ul class="today-brief-agenda">${topAgenda.map(x => `<li>${UI.escape(x)}</li>`).join('')}</ul>
    <div class="flex gap-sm mt-sm"><button class="btn btn-xs btn-ghost" onclick="Today.go('${c.id}','dashboard')">Client dashboard</button><button class="btn btn-xs btn-ghost" onclick="Today.go('${c.id}','plans')">Development plan</button><button class="btn btn-xs btn-ghost" onclick="Business.scheduleEdit('${session.id}')">Edit</button></div>
  </div>`;
};

Today.queueCard = function (title, count, body, action = '') {
  return `<div class="card today-queue"><div class="card-head"><h2>${title}</h2><div class="flex center gap-sm"><span class="today-count">${count}</span>${action}</div></div>${body}</div>`;
};

UI.renderers.today = function (el) {
  const snap = Today.snapshot();
  const priorities = Today.priorities(snap);
  const sessionsToday = snap.upcomingSessions.filter(s => s.date === snap.today);
  const dueReminders = snap.reminders.filter(r => r.dueDate <= snap.today);

  const priorityHtml = priorities.length ? priorities.map((p, i) => `<div class="today-priority">
    <div class="today-rank">${i + 1}</div>
    <div class="today-priority-main">
      <div class="flex between center gap"><button class="today-client large" onclick="Today.go('${p.client.id}','dashboard')">${UI.escape(p.client.name)}</button><span class="today-score">${p.score}</span></div>
      <div class="today-reasons">${p.reasons.length ? p.reasons.map(r => `<span>${UI.escape(r)}</span>`).join('') : '<span class="quiet">No urgent flags</span>'}</div>
    </div>
  </div>`).join('') : Today.empty('Add clients to generate roster priorities.');

  const sessionRows = snap.upcomingSessions.length ? snap.upcomingSessions.map(s => {
    const c = getClient(s.clientId);
    return `<div class="today-row"><div><b>${Today.when(s.date, s.time)}</b><div class="muted">${c ? UI.escape(c.name) : 'Unknown client'}${s.notes ? ' - ' + UI.escape(s.notes) : ''}</div></div><button class="btn btn-xs" onclick="Business.scheduleEdit('${s.id}')">Open</button></div>`;
  }).join('') : Today.empty('No sessions scheduled in the next 14 days.');

  const homeworkRows = snap.overdueHomework.length ? snap.overdueHomework.map(h => {
    const c = getClient(h.clientId);
    return `<div class="today-row danger"><label class="flex center gap-sm"><input type="checkbox" style="width:auto" onchange="Sessions.toggleHw('${h.sessionId}','${h.id}')"><span><b>${UI.escape(h.text)}</b><small>${c ? UI.escape(c.name) : 'Unknown'} - due ${UI.fmtDate(h.dueDate)}</small></span></label><button class="btn btn-xs btn-ghost" onclick="Today.go('${h.clientId}','sessions')">Session</button></div>`;
  }).join('') : Today.empty('Nothing overdue.');

  const inactiveRows = snap.inactivePlayers.length ? snap.inactivePlayers.map(x => `<div class="today-row"><div>${Today.clientButton(x.client)}<small>${x.days == null ? 'No activity recorded' : `${x.days} days since activity - ${UI.fmtDate(x.last)}`}</small></div><button class="btn btn-xs btn-ghost" onclick="Today.reminderEdit('','${x.clientId}')">Follow up</button></div>`).join('') : Today.empty('Everyone has recent activity.');

  const vodRows = snap.unreviewedVods.length ? snap.unreviewedVods.map(v => {
    const c = getClient(v.clientId);
    return `<div class="today-row"><div><b>${UI.escape(v.title)}</b><small>${c ? UI.escape(c.name) : 'Unknown'} - ${VOD_STATUS[Today.vodStatus(v)] || 'To review'} - ${UI.fmtDate(v.date)}</small></div><button class="btn btn-xs btn-primary" onclick="Today.openVod('${v.clientId}','${v.id}')">Review</button></div>`;
  }).join('') : Today.empty('The VOD inbox is clear.');

  const goalRows = snap.stalledGoals.length ? snap.stalledGoals.map(g => `<div class="today-row"><div><b>${UI.escape(g.title)}</b><small>${UI.escape(g.client.name)} - no update for ${g.days} days${g.progress == null ? '' : ` - ${g.progress}% complete`}</small></div><button class="btn btn-xs btn-ghost" onclick="Today.go('${g.clientId}','${g.plan ? 'plans' : 'dashboard'}')">Open</button></div>`).join('') : Today.empty('No goals have stalled.');

  const sessionRequestRows = snap.sessionRequests.length ? snap.sessionRequests.map(r => `<div class="today-row"><div><b>${UI.escape(r.client.name)}</b><small>${r.preferredTimes ? UI.escape(r.preferredTimes) : 'No preferred time given'}${r.message ? ' - ' + UI.escape(r.message) : ''} - ${UI.fmtDate(r.createdAt)}</small></div><div class="flex gap-sm"><button class="btn btn-xs btn-primary" onclick="Today.sessionRequestSchedule('${r.clientId}','${r.id}')">Schedule</button><button class="btn btn-xs btn-ghost" onclick="Today.sessionRequestResolve('${r.clientId}','${r.id}','dismissed')">Dismiss</button></div></div>`).join('') : Today.empty('No open session requests.');

  const reminderRows = snap.reminders.length ? snap.reminders.map(r => {
    const c = getClient(r.clientId);
    const overdue = r.dueDate < snap.today;
    return `<div class="today-row ${overdue ? 'danger' : ''}"><label class="flex center gap-sm"><input type="checkbox" style="width:auto" onchange="Today.reminderToggle('${r.id}')"><span><b>${UI.escape(r.text)}</b><small>${c ? UI.escape(c.name) : 'Roster'} - ${overdue ? 'overdue ' : r.dueDate === snap.today ? 'today - ' : ''}${UI.fmtDate(r.dueDate)}</small></span></label><button class="btn btn-xs btn-ghost" onclick="Today.reminderEdit('${r.id}')">Edit</button></div>`;
  }).join('') : Today.empty('No follow-ups due in the next 14 days.');

  el.innerHTML = `
    <div class="page-head">
      <div><div class="today-date">${UI.fmtDateLong(new Date())}</div><h1>Today</h1><div class="sub">${Clients.myClientsOnly && (DB.coaches || []).length > 1 ? 'Your assigned clients, ' : 'Your whole roster, '}distilled into the next best coaching actions.</div></div>
      <div class="flex gap-sm center">
        ${(DB.coaches || []).length > 1 ? `<label class="flex center gap-sm" style="font-size:.8rem;color:var(--text-muted)"><input type="checkbox" style="width:auto" ${Clients.myClientsOnly ? 'checked' : ''} onchange="Clients.setMyClientsOnly(this.checked)"> My clients only</label>` : ''}
        <button class="btn" onclick="Business.scheduleEdit()">+ Session</button><button class="btn btn-primary" onclick="Today.reminderEdit()">+ Follow-up</button>
      </div>
    </div>
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">Sessions Today</div><div class="value accent">${sessionsToday.length}</div></div>
      <div class="stat-tile"><div class="label">Overdue Homework</div><div class="value" style="color:${snap.overdueHomework.length ? 'var(--bad)' : 'var(--good)'}">${snap.overdueHomework.length}</div></div>
      <div class="stat-tile"><div class="label">Follow-ups Due</div><div class="value" style="color:${dueReminders.length ? 'var(--warn)' : 'var(--good)'}">${dueReminders.length}</div></div>
      <div class="stat-tile"><div class="label">Clients Needing Attention</div><div class="value">${priorities.filter(p => p.score >= 15).length}</div></div>
    </div>
    <div class="grid today-top">
      <div class="card"><div class="card-head"><h2>Suggested client priorities</h2><span class="muted" style="font-size:.72rem">Score explains itself</span></div>${priorityHtml}</div>
      ${Today.queueCard('Upcoming sessions', snap.upcomingSessions.length, sessionRows, "<button class=\"btn btn-xs btn-ghost\" onclick=\"App.nav('business')\">Calendar</button>")}
    </div>
    <div class="card mt mb"><div class="card-head"><h2>Session-preparation briefs</h2><span class="muted" style="font-size:.72rem">Next 14 days</span></div>
      <div class="today-brief-grid">${snap.upcomingSessions.length ? snap.upcomingSessions.map(s => Today.briefHtml(s, snap)).join('') : Today.empty('Schedule a session to generate a preparation brief.')}</div>
    </div>
    <div class="grid cols-2 today-queues">
      ${Today.queueCard('Overdue homework', snap.overdueHomework.length, homeworkRows)}
      ${Today.queueCard('Session requests', snap.sessionRequests.length, sessionRequestRows)}
      ${Today.queueCard('Follow-up reminders', snap.reminders.length, reminderRows, '<button class="btn btn-xs btn-primary" onclick="Today.reminderEdit()">+ Add</button>')}
      ${Today.queueCard('Players without recent activity', snap.inactivePlayers.length, inactiveRows)}
      ${Today.queueCard('Unreviewed VODs', snap.unreviewedVods.length, vodRows)}
      ${Today.queueCard('Stalled goals', snap.stalledGoals.length, goalRows)}
    </div>`;
};

Today.reminderEdit = function (id, clientId) {
  if (!DB.clients.length) { UI.toast('Add a client first.', 'bad'); return; }
  const r = id ? (DB.reminders || []).find(x => x.id === id) : null;
  const selected = r ? r.clientId : (clientId || DB.activeClientId || DB.clients[0].id);
  UI.modal(`<div class="modal-head"><h2>${r ? 'Edit' : 'Add'} Follow-up</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>Client</span><select id="tr-client">${DB.clients.map(c => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${UI.escape(c.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Reminder</span><input id="tr-text" value="${UI.escape(r ? r.text : '')}" placeholder="Check in after ranked block"></label>
    <label class="field"><span>Due date</span><input id="tr-due" type="date" value="${UI.escape(r ? r.dueDate : UI.today())}"></label>
    <div class="modal-foot">${r ? `<button class="btn btn-danger" onclick="Today.reminderRemove('${r.id}')">Delete</button>` : ''}<div style="flex:1"></div><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Today.reminderSave('${id || ''}')">Save</button></div>`);
};

Today.reminderSave = function (id) {
  const data = {
    clientId: document.getElementById('tr-client').value,
    text: document.getElementById('tr-text').value.trim(),
    dueDate: document.getElementById('tr-due').value || UI.today(),
  };
  if (!data.text) { UI.toast('Add a reminder.', 'bad'); return; }
  DB.reminders ||= [];
  const r = id ? DB.reminders.find(x => x.id === id) : null;
  if (r) Object.assign(r, data);
  else DB.reminders.push({ id: uid(), ...data, done: false, createdAt: new Date().toISOString() });
  saveDB(); UI.closeModal(); UI.toast('Follow-up saved.', 'good'); UI.refresh();
};
Today.reminderToggle = function (id) {
  const r = (DB.reminders || []).find(x => x.id === id);
  if (!r) return;
  r.done = !r.done;
  r.completedAt = r.done ? new Date().toISOString() : '';
  saveDB(); UI.refresh();
};
Today.reminderRemove = function (id) {
  DB.reminders = (DB.reminders || []).filter(x => x.id !== id);
  saveDB(); UI.closeModal(); UI.toast('Follow-up removed.'); UI.refresh();
};

Today.sessionRequestResolve = function (clientId, requestId, status) {
  const c = getClient(clientId);
  const r = c && (c.sessionRequests || []).find(x => x.id === requestId);
  if (!r) return;
  r.status = status || 'resolved';
  r.resolvedAt = new Date().toISOString();
  saveDB(); UI.refresh();
};
Today.sessionRequestSchedule = function (clientId, requestId) {
  Today.activate(clientId);
  Today.sessionRequestResolve(clientId, requestId, 'scheduled');
  Business.scheduleEdit();
};


