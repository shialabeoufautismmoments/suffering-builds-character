/* =============================================================================
   COACHES -team profiles, assignment overview, and current-user switching
   ============================================================================= */
const Coaches = {};

Coaches.currency = value => Number(value || 0).toLocaleString('en-CA', {
  style: 'currency', currency: (DB.settings && DB.settings.currency) || 'CAD',
  maximumFractionDigits: 0,
});

Coaches.metrics = function (coach) {
  const clients = DB.clients.filter(client => client.coachId === coach.id);
  const clientIds = new Set(clients.map(client => client.id));
  const sessions = DB.sessions.filter(session => session.coachId === coach.id || clientIds.has(session.clientId));
  const upcoming = DB.scheduled.filter(item => !item.done && (item.coachId === coach.id || clientIds.has(item.clientId)) && item.date >= UI.today());
  const packages = clients.flatMap(client => client.packages || []);
  const collected = packages.filter(pkg => pkg.paid).reduce((sum, pkg) => sum + Number(pkg.price || 0), 0);
  const outstanding = packages.filter(pkg => !pkg.paid).reduce((sum, pkg) => sum + Number(pkg.price || 0), 0);
  return { clients, sessions, upcoming, collected, outstanding };
};

Coaches.render = function (el) {
  const coaches = DB.coaches || [];
  const allMetrics = coaches.map(Coaches.metrics);
  const totalRevenue = allMetrics.reduce((sum, item) => sum + item.collected, 0);
  const assigned = new Set(DB.clients.filter(client => client.coachId).map(client => client.id)).size;
  el.innerHTML = `<div class="page-head">
    <div><div class="kicker">TEAM WORKSPACE</div><h1>Coaches</h1><div class="sub">Manage profiles, assignments, workload, and who is currently using the program.</div></div>
    <button class="btn btn-primary" onclick="Coaches.edit()">+ Add coach</button>
  </div>
  <div class="stat-tiles coach-team-stats">
    <div class="stat-tile"><div class="label">Coaches</div><div class="value">${coaches.length}</div><small>team profiles</small></div>
    <div class="stat-tile"><div class="label">Assigned clients</div><div class="value">${assigned}</div><small>${DB.clients.length - assigned} unassigned</small></div>
    <div class="stat-tile"><div class="label">Upcoming sessions</div><div class="value">${allMetrics.reduce((sum, item) => sum + item.upcoming.length, 0)}</div><small>across the team</small></div>
    <div class="stat-tile"><div class="label">Collected revenue</div><div class="value accent">${Coaches.currency(totalRevenue)}</div><small>assigned packages</small></div>
  </div>
  <div class="coach-team-grid">
    ${coaches.map((coach, index) => Coaches.card(coach, allMetrics[index])).join('')}
    ${!coaches.length ? UI.emptyState('TEAM', 'No coach profiles', 'Add the first coach to begin assigning clients and activity.') : ''}
  </div>`;
};

Coaches.card = function (coach, metrics) {
  const current = coach.id === Access.currentCoachId;
  const clientNames = metrics.clients.slice(0, 4).map(client => UI.escape(client.name));
  return `<article class="coach-team-card ${current ? 'current' : ''}">
    <div class="coach-team-head">
      <span class="coach-avatar" style="--coach-color:${UI.escape(coach.color || '#e8833a')}">${UI.escape(Access.initials(coach.name))}</span>
      <div><h2>${UI.escape(coach.name)}</h2><p>${UI.escape(coach.role || 'Coach')}</p></div>
      ${current ? '<span class="pill good">CURRENT</span>' : ''}
    </div>
    <div class="coach-team-metrics">
      <div><b>${metrics.clients.length}</b><span>Clients</span></div>
      <div><b>${metrics.sessions.length}</b><span>Sessions</span></div>
      <div><b>${metrics.upcoming.length}</b><span>Upcoming</span></div>
      <div><b>${Coaches.currency(metrics.collected)}</b><span>Collected</span></div>
    </div>
    <div class="coach-client-list">
      <span>Assigned roster</span>
      <p>${clientNames.length ? clientNames.join(' · ') + (metrics.clients.length > 4 ? ` · +${metrics.clients.length - 4}` : '') : 'No clients assigned yet'}</p>
    </div>
    ${metrics.outstanding ? `<div class="coach-outstanding">${Coaches.currency(metrics.outstanding)} outstanding</div>` : ''}
    <div class="coach-team-actions">
      ${current ? '<button class="btn btn-sm btn-primary" disabled>Currently using</button>' : `<button class="btn btn-sm btn-primary" onclick="Coaches.use('${coach.id}')">Switch to coach</button>`}
      <button class="btn btn-sm" onclick="Coaches.edit('${coach.id}')">Edit</button>
      <button class="btn btn-sm btn-ghost" onclick="Coaches.showClients('${coach.id}')">View clients</button>
      <button class="btn btn-sm btn-danger" onclick="Coaches.remove('${coach.id}')">Remove</button>
    </div>
  </article>`;
};

Coaches.edit = function (id = '') {
  const coach = (DB.coaches || []).find(item => item.id === id);
  const color = coach && coach.color || ['#e8833a', '#55c2ff', '#72d99f', '#c395ff', '#ff7b72'][DB.coaches.length % 5];
  UI.modal(`<div class="modal-head"><h2>${coach ? 'Edit coach' : 'Add coach'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="coach-edit-preview"><span class="coach-avatar" id="coach-edit-avatar" style="--coach-color:${color}">${UI.escape(Access.initials(coach && coach.name || 'New'))}</span><div><b>${UI.escape(coach && coach.name || 'New coach')}</b><p class="muted">Shared team profile</p></div></div>
    <label class="field"><span>Name</span><input id="coach-name" value="${UI.escape(coach && coach.name || '')}" oninput="Coaches.preview()" placeholder="Coach name"></label>
    <label class="field"><span>Role or specialty</span><input id="coach-role" value="${UI.escape(coach && coach.role || '')}" placeholder="Head coach, tracking specialist..."></label>
    <div class="row">
      <label class="field"><span>Email (optional)</span><input id="coach-email" type="email" value="${UI.escape(coach && coach.email || '')}"></label>
      <label class="field"><span>Discord (optional)</span><input id="coach-discord" value="${UI.escape(coach && coach.discord || '')}"></label>
    </div>
    <label class="field"><span>Profile colour</span><input id="coach-color" type="color" value="${UI.escape(color)}" oninput="Coaches.preview()"></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Coaches.save('${id}')">${coach ? 'Save changes' : 'Add coach'}</button></div>`);
};

Coaches.preview = function () {
  const avatar = document.getElementById('coach-edit-avatar');
  if (!avatar) return;
  avatar.textContent = Access.initials(document.getElementById('coach-name').value || 'New');
  avatar.style.setProperty('--coach-color', document.getElementById('coach-color').value);
};

Coaches.save = function (id = '') {
  const name = document.getElementById('coach-name').value.trim();
  if (!name) return UI.toast('Coach name is required.', 'bad');
  const data = {
    name,
    role: document.getElementById('coach-role').value.trim(),
    email: document.getElementById('coach-email').value.trim(),
    discord: document.getElementById('coach-discord').value.trim(),
    color: document.getElementById('coach-color').value,
    updatedAt: new Date().toISOString(),
  };
  if (id) Object.assign(DB.coaches.find(item => item.id === id), data);
  else {
    const coach = { id: uid(), ...data, createdAt: new Date().toISOString() };
    DB.coaches.push(coach);
    if (!Access.currentCoachId) Access.currentCoachId = coach.id;
  }
  saveDB();
  Access.updateNav();
  UI.closeModal();
  UI.toast('Coach profile saved.', 'good');
  UI.refresh();
};

Coaches.use = function (id) {
  Access.selectCoach(id);
  App.nav('coaches');
};

Coaches.showClients = function (id) {
  const assigned = DB.clients.filter(client => client.coachId === id);
  UI.modal(`<div class="modal-head"><h2>${UI.escape((DB.coaches.find(coach => coach.id === id) || {}).name || 'Coach')} - Clients</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    ${assigned.length ? assigned.map(client => `<button class="coach-assigned-client" onclick="UI.closeModal();Clients.setActive('${client.id}');App.nav('dashboard')"><span class="avatar">${UI.escape(UI.initials(client.name))}</span><span><b>${UI.escape(client.name)}</b><small>${UI.escape(client.game || '')} · ${UI.escape(client.rank || 'Unranked')}</small></span></button>`).join('') : UI.emptyState('—', 'No assigned clients', 'Assign this coach from any client profile.')}
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Close</button></div>`);
};

Coaches.remove = function (id) {
  const coach = DB.coaches.find(item => item.id === id);
  if (!coach) return;
  if (DB.coaches.length <= 1) return UI.toast('Keep at least one coach profile.', 'bad');
  const replacement = DB.coaches.find(item => item.id !== id);
  const assigned = DB.clients.filter(client => client.coachId === id).length;
  UI.confirm(`Remove ${coach.name}? ${assigned ? `${assigned} assigned client${assigned === 1 ? '' : 's'} will be reassigned to ${replacement.name}.` : 'This cannot be undone.'}`, () => {
    DB.clients.filter(client => client.coachId === id).forEach(client => { client.coachId = replacement.id; });
    DB.coaches = DB.coaches.filter(item => item.id !== id);
    if (Access.currentCoachId === id) Access.currentCoachId = replacement.id;
    saveDB();
    Access.updateNav();
    UI.toast('Coach removed and clients reassigned.', 'good');
    UI.refresh();
  }, { yes: 'Remove coach' });
};

UI.renderers.coaches = Coaches.render;
