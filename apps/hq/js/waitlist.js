/* =============================================================================
   LEADS - durable coaching application pipeline. Website submissions live in
   Netlify Blobs; older desktop-only leads remain editable for compatibility.
   ============================================================================= */
const Waitlist = {
  items: [],
  loaded: false,
  loading: false,
  filter: 'Open',
  focusId: '',
  statuses: ['New', 'Contacted', 'Qualified', 'Booked', 'Closed', 'Archived'],
};

Waitlist.isRemote = () => !!(window.COACHSBC_WEB && window.api.coachLeadsGet);
Waitlist.isOpen = lead => !['Closed', 'Archived'].includes(lead.status || 'New');
Waitlist.coachName = id => ((DB.coaches || []).find(coach => coach.id === id) || {}).name || 'Unassigned';
Waitlist.all = function () {
  const remoteIds = new Set(Waitlist.items.map(lead => lead.id));
  const legacy = (DB.leads || []).filter(lead => !remoteIds.has(lead.id)).map(lead => ({
    ...lead,
    status: lead.status || 'New',
    internalNotes: lead.internalNotes || lead.notes || '',
    source: lead.source || 'legacy',
    _storage: 'legacy',
  }));
  return [...Waitlist.items, ...legacy].sort((a, b) =>
    String(b.createdAt || b.contactDate || '').localeCompare(String(a.createdAt || a.contactDate || ''))
  );
};

Waitlist.load = async function () {
  if (!Waitlist.isRemote() || Waitlist.loading) return;
  Waitlist.loading = true;
  try {
    const result = await window.api.coachLeadsGet();
    Waitlist.items = result.leads || [];
    Waitlist.loaded = true;
  } catch (error) {
    UI.toast(error.message || 'Could not load leads.', 'bad');
  } finally {
    Waitlist.loading = false;
    if (UI.currentView === 'waitlist') UI.refresh();
  }
};

UI.renderers.waitlist = function (el) {
  if (Waitlist.isRemote() && !Waitlist.loaded) {
    el.innerHTML = `<div class="page-head"><div><div class="kicker">COACHING PIPELINE</div><h1>Leads</h1><div class="sub">Loading saved applications...</div></div></div>`;
    Waitlist.load();
    return;
  }

  const all = Waitlist.all();
  const visible = all.filter(lead => {
    if (Waitlist.filter === 'All') return true;
    if (Waitlist.filter === 'Open') return Waitlist.isOpen(lead);
    return (lead.status || 'New') === Waitlist.filter;
  });
  const count = status => all.filter(lead => (lead.status || 'New') === status).length;

  el.innerHTML = `
    <div class="page-head">
      <div><div class="kicker">COACHING PIPELINE</div><h1>Leads</h1><div class="sub">Every website application is saved here before Discord is notified.</div></div>
      <button class="btn btn-primary" onclick="Waitlist.edit()">+ Add lead</button>
    </div>
    <div class="lead-stats">
      ${['New', 'Contacted', 'Qualified', 'Booked'].map(status => `<button class="lead-stat ${Waitlist.filter === status ? 'active' : ''}" onclick="Waitlist.setFilter('${status}')"><span>${UI.escape(status)}</span><b>${count(status)}</b></button>`).join('')}
    </div>
    <div class="lead-toolbar" role="group" aria-label="Filter leads">
      ${['Open', 'All', 'New', 'Contacted', 'Qualified', 'Booked', 'Closed', 'Archived'].map(status => `<button class="btn btn-sm ${Waitlist.filter === status ? 'btn-primary' : 'btn-ghost'}" onclick="Waitlist.setFilter('${status}')">${UI.escape(status)}</button>`).join('')}
      ${Waitlist.isRemote() ? '<button class="btn btn-sm btn-ghost" onclick="Waitlist.reload()">Refresh</button>' : ''}
    </div>
    ${visible.length ? `<div class="lead-list">${visible.map(Waitlist.card).join('')}</div>`
      : UI.emptyState('INBOX', `No ${Waitlist.filter.toLowerCase()} leads`, 'New coaching applications will appear here automatically.')}`;

  if (Waitlist.focusId) {
    const targetId = Waitlist.focusId;
    setTimeout(() => document.querySelector(`[data-lead-id="${CSS.escape(targetId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }
};

Waitlist.card = function (lead) {
  const id = UI.escape(lead.id);
  const status = lead.status || 'New';
  const coachOptions = [`<option value="">Unassigned</option>`, ...(DB.coaches || []).map(coach =>
    `<option value="${UI.escape(coach.id)}" ${coach.id === lead.assignedCoachId ? 'selected' : ''}>${UI.escape(coach.name)}</option>`
  )].join('');
  const submitted = lead.createdAt ? UI.fmtDate(lead.createdAt.slice(0, 10)) : (lead.contactDate ? UI.fmtDate(lead.contactDate) : 'Unknown');
  return `<article class="lead-card ${Waitlist.focusId === lead.id ? 'focused' : ''}" data-lead-id="${id}">
    <div class="lead-card-main">
      <div class="lead-card-title"><div><h2>${UI.escape(lead.name || lead.discord || 'Unnamed lead')}</h2><p>${UI.escape(lead.discord || 'No Discord username')} · ${UI.escape(lead.game || 'Game not provided')} · ${UI.escape(lead.rank || 'Rank not provided')}</p></div><span class="lead-source">${UI.escape(lead.source || 'manual')}</span></div>
      <p class="lead-goals">${UI.escape(lead.goals || lead.internalNotes || 'No coaching goals recorded.')}</p>
      <div class="lead-meta"><span>Submitted ${submitted}</span>${lead.service ? `<span>${UI.escape(lead.service)}</span>` : ''}${lead.role ? `<span>${UI.escape(lead.role)}</span>` : ''}</div>
    </div>
    <div class="lead-card-controls">
      <label><span>Status</span><select onchange="Waitlist.quickUpdate('${id}', 'status', this.value)">${Waitlist.statuses.map(value => `<option ${value === status ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      <label><span>Assigned coach</span><select onchange="Waitlist.quickUpdate('${id}', 'assignedCoachId', this.value)">${coachOptions}</select></label>
      <div class="lead-actions"><button class="btn btn-xs btn-primary" onclick="Waitlist.convert('${id}')">Convert</button><button class="btn btn-xs btn-ghost" onclick="Waitlist.edit('${id}')">Open</button>${status !== 'Archived' ? `<button class="btn btn-xs btn-danger" onclick="Waitlist.archive('${id}')">Archive</button>` : ''}</div>
    </div>
  </article>`;
};

Waitlist.setFilter = function (value) {
  Waitlist.filter = value;
  UI.refresh();
};

Waitlist.reload = function () {
  Waitlist.loaded = false;
  UI.refresh();
};

Waitlist.find = id => Waitlist.all().find(lead => lead.id === id);

Waitlist.edit = function (id = '') {
  const lead = id ? Waitlist.find(id) : null;
  const f = (key, fallback = '') => UI.escape(lead ? (lead[key] ?? fallback) : fallback);
  const status = lead?.status || 'New';
  UI.modal(`
    <div class="modal-head"><div><h2>${lead ? 'Lead details' : 'Add lead'}</h2>${lead ? `<p class="muted">${UI.escape(lead.source || 'manual')} · ${UI.escape(lead.id)}</p>` : ''}</div><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row">
      <label class="field"><span>Player name</span><input id="l-name" value="${f('name')}" placeholder="Player name"></label>
      <label class="field"><span>Discord username</span><input id="l-discord" value="${f('discord')}" placeholder="username"></label>
    </div>
    <div class="row">
      <label class="field"><span>Game</span><input id="l-game" value="${f('game', 'Overwatch 2')}"></label>
      <label class="field"><span>Rank</span><input id="l-rank" value="${f('rank')}" placeholder="e.g. Diamond"></label>
      <label class="field"><span>Role / heroes</span><input id="l-role" value="${f('role')}"></label>
    </div>
    <div class="row">
      <label class="field"><span>Service</span><input id="l-service" value="${f('service')}"></label>
      <label class="field"><span>Status</span><select id="l-status">${Waitlist.statuses.map(value => `<option ${value === status ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      <label class="field"><span>Assigned coach</span><select id="l-assignedCoachId"><option value="">Unassigned</option>${(DB.coaches || []).map(coach => `<option value="${UI.escape(coach.id)}" ${coach.id === lead?.assignedCoachId ? 'selected' : ''}>${UI.escape(coach.name)}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Availability</span><input id="l-availability" value="${f('availability')}"></label>
    <label class="field"><span>VOD / replay link</span><input id="l-vodUrl" type="url" value="${f('vodUrl')}"></label>
    <label class="field"><span>Coaching goals</span><textarea id="l-goals" placeholder="What they want to improve">${f('goals')}</textarea></label>
    <label class="field"><span>Internal notes</span><textarea id="l-internalNotes" placeholder="Follow-up notes, budget, next action...">${f('internalNotes', lead?.notes || '')}</textarea></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Waitlist.save('${UI.escape(id)}')">${lead ? 'Save changes' : 'Add lead'}</button></div>`);
};

Waitlist.formData = function () {
  const get = key => document.getElementById(`l-${key}`).value.trim();
  return {
    name: get('name'), discord: get('discord'), game: get('game'), rank: get('rank'), role: get('role'),
    service: get('service'), status: get('status'), assignedCoachId: get('assignedCoachId'),
    availability: get('availability'), vodUrl: get('vodUrl'), goals: get('goals'), internalNotes: get('internalNotes'),
  };
};

Waitlist.save = async function (id = '') {
  const data = Waitlist.formData();
  if (!data.name && !data.discord) return UI.toast('Add a player name or Discord username.', 'bad');
  const existing = id ? Waitlist.find(id) : null;
  try {
    if (Waitlist.isRemote() && (!existing || existing._storage !== 'legacy')) {
      const result = id
        ? await window.api.coachLeadsPut({ id, ...data })
        : await window.api.coachLeadsPost(data);
      if (id) Waitlist.items = Waitlist.items.map(lead => lead.id === id ? result.lead : lead);
      else Waitlist.items.unshift(result.lead);
    } else if (id) {
      Object.assign(DB.leads.find(lead => lead.id === id), data, { notes: data.internalNotes, updatedAt: new Date().toISOString() });
      saveDB();
    } else {
      (DB.leads ||= []).push({ id: uid(), ...data, notes: data.internalNotes, source: 'manual', createdAt: new Date().toISOString() });
      saveDB();
    }
    UI.closeModal();
    UI.toast('Lead saved.', 'good');
    UI.refresh();
  } catch (error) {
    UI.toast(error.message || 'Could not save the lead.', 'bad');
  }
};

Waitlist.quickUpdate = async function (id, field, value) {
  const lead = Waitlist.find(id);
  if (!lead) return;
  try {
    if (Waitlist.isRemote() && lead._storage !== 'legacy') {
      const result = await window.api.coachLeadsPut({ id, [field]: value });
      Waitlist.items = Waitlist.items.map(item => item.id === id ? result.lead : item);
    } else {
      const local = DB.leads.find(item => item.id === id);
      if (local) Object.assign(local, { [field]: value, updatedAt: new Date().toISOString() });
      saveDB();
    }
    UI.toast('Lead updated.', 'good');
    UI.refresh();
  } catch (error) {
    UI.toast(error.message || 'Could not update the lead.', 'bad');
    UI.refresh();
  }
};

Waitlist.archive = function (id) {
  const lead = Waitlist.find(id);
  if (!lead) return;
  UI.confirm(`Archive ${lead.name || lead.discord || 'this lead'}? The record will be retained.`, () => Waitlist.quickUpdate(id, 'status', 'Archived'), { yes: 'Archive' });
};

Waitlist.convert = function (id) {
  const lead = Waitlist.find(id);
  if (!lead) return;
  const name = lead.name || lead.discord || 'New Client';
  UI.confirm(`Convert "${name}" to an active client and mark the lead as booked?`, async () => {
    const client = {
      id: uid(), name, game: lead.game || 'Overwatch 2', rank: lead.rank || '', role: lead.role || '',
      discord: lead.discord || '', coachId: lead.assignedCoachId || Access.currentCoachId || '',
      dpi: '', sens: '', cm360: '', notes: lead.internalNotes || lead.goals || '',
      goals: lead.goals ? [{ id: uid(), text: lead.goals, done: false, createdAt: new Date().toISOString() }] : [], heroes: [], prs: {}, activity: {}, createdAt: new Date().toISOString(),
    };
    DB.clients.push(client);
    DB.activeClientId = client.id;
    saveDB();
    await Waitlist.quickUpdate(id, 'status', 'Booked');
    UI.updateClientPill();
    UI.toast(`${name} is now an active client.`, 'good');
    App.nav('dashboard');
  }, { danger: false, yes: 'Convert' });
};
