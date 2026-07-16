/* =============================================================================
   SESSIONS -coaching session log with assignable homework checklists.
   ============================================================================= */
const Sessions = {};

const HW_TYPES = { playlist: 'Playlist', vod: 'Watch VOD', map: 'Map review', drill: 'Drill', other: 'Other' };
Sessions._formHw = [];

UI.renderers.sessions = function (el) {
  if (UI.requireClient(el, 'Sessions')) return;
  const c = activeClient();
  const ss = clientSessions(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Outstanding homework across all sessions.
  const allHw = ss.flatMap(s => (s.homework || []).map(h => ({ ...h, sid: s.id, date: s.date })));
  const openHw = allHw.filter(h => !h.done);
  const today = UI.today();

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Sessions</h1><div class="sub">Coaching log & homework for <b>${UI.escape(c.name)}</b>.</div></div>
      <div class="flex gap-sm">
        <button class="btn" onclick="Sessions.bulkAssignHomework()">Bulk Assign Homework</button>
        <button class="btn btn-primary" onclick="Sessions.edit()">+ Log Session</button>
      </div>
    </div>

    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">Sessions</div><div class="value">${ss.length}</div></div>
      <div class="stat-tile"><div class="label">Total Coached</div><div class="value accent">${Math.round(ss.reduce((s, x) => s + (+x.durationMin || 0), 0) / 60 * 10) / 10}h</div></div>
      <div class="stat-tile"><div class="label">Open Homework</div><div class="value" style="color:${openHw.length ? 'var(--warn)' : 'var(--good)'}">${openHw.length}</div></div>
    </div>

    ${openHw.length ? `<div class="card mb">
      <div class="card-head"><h2>Outstanding Homework</h2></div>
      ${openHw.map(h => `<div class="flex between center" style="padding:.35rem 0;border-bottom:1px solid var(--border-soft)">
        <label class="flex center gap-sm" style="cursor:pointer"><input type="checkbox" style="width:auto" onchange="Sessions.toggleHw('${h.sid}','${h.id}')">
          <span><span class="pill">${HW_TYPES[h.type] || h.type}</span> ${UI.escape(h.text)}</span></label>
        <span class="muted" style="font-size:.74rem;color:${h.dueDate && h.dueDate < today ? 'var(--bad)' : ''}">${h.dueDate ? (h.dueDate < today ? 'Overdue ' : 'Due ') + UI.fmtDate(h.dueDate) : 'Assigned ' + UI.fmtDate(h.date)}</span>
      </div>`).join('')}
    </div>` : ''}

    ${ss.length ? ss.map(s => Sessions.cardHtml(s)).join('')
      : UI.emptyState('📋', 'No sessions logged', 'Log a coaching session and assign homework to track follow-through.')}`;
};

Sessions.cardHtml = function (s) {
  const hw = s.homework || [];
  const done = hw.filter(h => h.done).length;
  return `<div class="card mb">
    <div class="flex between center">
      <div><h2 style="font-size:1rem;display:inline">${UI.fmtDate(s.date)}</h2>
        <span class="muted" style="font-size:.8rem"> - ${s.durationMin || 0} min${s.prepMinutes ? ' - ' + s.prepMinutes + 'm prep' : ''}${s.topics ? ' - ' + UI.escape(s.topics) : ''}</span></div>
      <div class="flex gap-sm">
        ${hw.length ? `<button class="btn btn-xs btn-ghost" onclick="Cards.homework('${s.id}')" title="Copy homework card for Discord">🖼</button>
        <button class="btn btn-xs btn-ghost" onclick="Cards.homework('${s.id}', true)" title="Post homework card to Discord">📨</button>` : ''}
        <button class="btn btn-xs btn-ghost" onclick="Sessions.edit('${s.id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="Sessions.remove('${s.id}')">x</button>
      </div>
    </div>
    ${s.notes ? `<p class="muted" style="font-size:.84rem;margin-top:.4rem">${UI.escape(s.notes)}</p>` : ''}
    ${hw.length ? `<div class="divider" style="margin:.7rem 0"></div>
      <div class="flex between center" style="margin-bottom:.3rem"><b style="font-size:.8rem">Homework</b><span class="muted" style="font-size:.74rem">${done}/${hw.length} done</span></div>
      ${hw.map(h => `<label class="flex center gap-sm" style="cursor:pointer;padding:.2rem 0">
        <input type="checkbox" style="width:auto" ${h.done ? 'checked' : ''} onchange="Sessions.toggleHw('${s.id}','${h.id}')">
        <span style="${h.done ? 'text-decoration:line-through;color:var(--text-dim)' : ''}"><span class="pill">${HW_TYPES[h.type] || h.type}</span> ${UI.escape(h.text)}${h.dueDate ? ` <span class="muted" style="font-size:.7rem">- due ${UI.fmtDate(h.dueDate)}</span>` : ''}${h.clientNote ? ` <span class="muted" style="font-size:.7rem">- client note: ${UI.escape(h.clientNote)}</span>` : ''}</span>
      </label>`).join('')}` : ''}
  </div>`;
};

Sessions.edit = function (id) {
  const s = id ? DB.sessions.find(x => x.id === id) : null;
  Sessions._formHw = s ? JSON.parse(JSON.stringify(s.homework || [])) : [];
  const f = (k, d = '') => UI.escape(s ? (s[k] ?? d) : d);
  UI.modal(`
    <div class="modal-head"><h2>${s ? 'Edit Session' : 'Log Session'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row">
      <label class="field"><span>Date</span><input id="s-date" type="date" value="${f('date', UI.today())}"></label>
      <label class="field"><span>Duration (min)</span><input id="s-durationMin" type="number" value="${f('durationMin', '60')}"></label>
      <label class="field"><span>Preparation (min)</span><input id="s-prepMinutes" type="number" min="0" value="${f('prepMinutes', '0')}" placeholder="15"></label>
    </div>
    <label class="field"><span>Topics covered</span><input id="s-topics" value="${f('topics')}" placeholder="e.g. crosshair placement, ult tracking"></label>
    <label class="field"><span>Session notes</span><textarea id="s-notes" placeholder="What you worked on, key takeaways...">${f('notes')}</textarea></label>
    <label class="field"><span>Homework</span>
      <div id="s-hw-list"></div>
      <div class="flex gap-sm mt-sm">
        <select id="s-hw-type" style="max-width:130px">${Object.entries(HW_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input id="s-hw-text" placeholder="Assignment..." onkeydown="if(event.key==='Enter'){event.preventDefault();Sessions.addHw()}">
        <input id="s-hw-due" type="date" title="Due date" style="max-width:145px">
        <button type="button" class="btn" onclick="Sessions.addHw()">Add</button>
      </div>
    </label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Sessions.save('${id || ''}')">${s ? 'Save' : 'Log Session'}</button>
    </div>`, { wide: true });
  Sessions.renderFormHw();
};

Sessions.addHw = function () {
  const text = document.getElementById('s-hw-text').value.trim();
  if (!text) return;
  Sessions._formHw.push({
    id: uid(), text, type: document.getElementById('s-hw-type').value,
    dueDate: document.getElementById('s-hw-due').value, done: false,
  });
  document.getElementById('s-hw-text').value = '';
  document.getElementById('s-hw-due').value = '';
  Sessions.renderFormHw();
};
Sessions.setFormHwDue = function (hid, value) {
  const h = Sessions._formHw.find(x => x.id === hid);
  if (h) h.dueDate = value;
};
Sessions.removeFormHw = function (hid) {
  Sessions._formHw = Sessions._formHw.filter(h => h.id !== hid);
  Sessions.renderFormHw();
};
Sessions.renderFormHw = function () {
  const box = document.getElementById('s-hw-list');
  box.innerHTML = Sessions._formHw.length ? Sessions._formHw.map(h => `
    <div class="flex between center" style="padding:.25rem 0">
      <span style="font-size:.84rem"><span class="pill">${HW_TYPES[h.type] || h.type}</span> ${UI.escape(h.text)}</span>
      <input type="date" value="${UI.escape(h.dueDate || '')}" title="Due date" style="max-width:145px;margin-left:auto" onchange="Sessions.setFormHwDue('${h.id}',this.value)">
      <button type="button" class="btn btn-xs btn-ghost" onclick="Sessions.removeFormHw('${h.id}')">x</button>
    </div>`).join('') : '<span class="muted" style="font-size:.78rem">No homework yet.</span>';
};

Sessions.save = function (id) {
  const data = {
    date: document.getElementById('s-date').value || UI.today(),
    durationMin: parseInt(document.getElementById('s-durationMin').value) || 0,
    prepMinutes: Math.max(0, parseInt(document.getElementById('s-prepMinutes').value) || 0),
    topics: document.getElementById('s-topics').value.trim(),
    notes: document.getElementById('s-notes').value.trim(),
    homework: JSON.parse(JSON.stringify(Sessions._formHw)),
  };
  if (id) Object.assign(DB.sessions.find(x => x.id === id), data);
  else DB.sessions.push({ id: uid(), clientId: activeClient().id, ...data, createdAt: new Date().toISOString() });
  saveDB();
  UI.closeModal();
  UI.toast('Session saved.', 'good');
  UI.refresh();
};

Sessions.remove = function (id) {
  UI.confirm('Delete this session and its homework?', () => {
    DB.sessions = DB.sessions.filter(x => x.id !== id);
    saveDB(); UI.toast('Session deleted.'); UI.refresh();
  });
};

Sessions.toggleHw = function (sid, hid) {
  const s = DB.sessions.find(x => x.id === sid);
  const h = (s.homework || []).find(x => x.id === hid);
  if (h) { h.done = !h.done; saveDB(); UI.refresh(); }
};

/* -- Bulk-assign homework across the roster ---------------------------------- */
Sessions.bulkAssignHomework = function () {
  UI.modal(`
    <div class="modal-head"><h2>Bulk Assign Homework</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <p class="muted" style="font-size:.82rem;margin-bottom:.6rem">Creates a small homework-only session entry for each client you pick — useful for assigning the same drill to a whole team at once.</p>
    <div class="row">
      <label class="field"><span>Type</span><select id="bhw-type">${Object.entries(HW_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="field"><span>Due date</span><input id="bhw-due" type="date"></label>
    </div>
    <label class="field"><span>Assignment</span><input id="bhw-text" placeholder="e.g. Run Daily Warmup 3x this week"></label>
    <label class="field"><span>Apply to</span>${UI.clientChecklistHtml({ includeActive: true, preCheckActive: true })}</label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Sessions.bulkAssignSave()">Assign Homework</button>
    </div>`, { wide: true });
};

Sessions.bulkAssignSave = function () {
  const text = document.getElementById('bhw-text').value.trim();
  if (!text) { UI.toast('Enter the assignment text.', 'bad'); return; }
  const type = document.getElementById('bhw-type').value;
  const dueDate = document.getElementById('bhw-due').value;
  const clientIds = UI.checkedClientIds();
  if (!clientIds.length) { UI.toast('Pick at least one client.', 'bad'); return; }
  const now = new Date().toISOString();
  clientIds.forEach(clientId => {
    DB.sessions.push({
      id: uid(), clientId, date: UI.today(), durationMin: 0, prepMinutes: 0,
      topics: 'Bulk homework assignment', notes: '',
      homework: [{ id: uid(), text, type, dueDate, done: false }],
      createdAt: now,
    });
  });
  saveDB();
  UI.closeModal();
  UI.toast(`Assigned to ${clientIds.length} client${clientIds.length === 1 ? '' : 's'}.`, 'good');
  UI.refresh();
};


