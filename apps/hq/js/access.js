/* =============================================================================
   ACCESS -single team password + current coach selection
   ============================================================================= */
const Access = {
  unlocked: false,
  currentCoachId: null,
  _unlockResolve: null,
  _coachResolve: null,
};

Access.bootstrap = function () {
  const gate = document.getElementById('access-gate');
  gate.classList.add('show');
  gate.innerHTML = `<div class="access-shell">
    <section class="access-hero">
      <div class="access-brand"><span></span> CoachSBC HQ</div>
      <h1>One team.<br><em>Every coaching tool.</em></h1>
      <p>Unlock the shared workspace, choose your coach profile, and continue where the team left off.</p>
    </section>
    <section class="access-panel">
      <form class="access-form" onsubmit="Access.submitPassword(event)">
        <div class="kicker">PRIVATE COACH ACCESS</div>
        <h2>Unlock dashboard</h2>
        <p>Enter the single team password.</p>
        <label>Team password<input id="access-password" type="password" autocomplete="current-password" required autofocus></label>
        <div id="access-error" class="access-error"></div>
        <button id="access-submit" class="btn btn-primary" type="submit">Unlock workspace</button>
        <small>The password is verified by your website and is never stored in this app.</small>
      </form>
    </section>
  </div>`;
  return new Promise(resolve => { Access._unlockResolve = resolve; });
};

Access.submitPassword = async function (event) {
  event.preventDefault();
  const button = document.getElementById('access-submit');
  const error = document.getElementById('access-error');
  button.disabled = true;
  button.textContent = 'Unlocking...';
  error.textContent = '';
  try {
    await window.api.coachUnlock(document.getElementById('access-password').value);
    Access.unlocked = true;
    document.getElementById('access-gate').classList.remove('show');
    Access._unlockResolve(true);
  } catch (e) {
    error.textContent = e.message || 'Could not unlock the workspace.';
    button.disabled = false;
    button.textContent = 'Unlock workspace';
  }
};

Access.ensureCoach = function () {
  DB.coaches ||= [];
  Access.renderCoachPicker();
  return new Promise(resolve => { Access._coachResolve = resolve; });
};

Access.renderCoachPicker = function () {
  const gate = document.getElementById('access-gate');
  gate.classList.add('show');
  gate.innerHTML = `<div class="coach-select-shell">
    <div class="access-brand dark"><span></span> CoachSBC HQ</div>
    <div class="kicker">SHARED WORKSPACE</div>
    <h1>Who's coaching today?</h1>
    <p>Select your profile so sessions, notes, reports, and client activity are attributed correctly.</p>
    <div class="coach-select-grid">
      ${(DB.coaches || []).map(c => `<button class="coach-select-card" onclick="Access.chooseCoach('${c.id}')">
        <span class="coach-avatar" style="--coach-color:${UI.escape(c.color || '#f0a11a')}">${UI.escape(Access.initials(c.name))}</span>
        <b>${UI.escape(c.name)}</b><small>${UI.escape(c.role || 'Coach')}</small>
      </button>`).join('')}
      <button class="coach-select-card add" onclick="Access.addCoachForm()">
        <span class="coach-avatar">+</span><b>Add coach</b><small>Create a team profile</small>
      </button>
    </div>
    <button class="btn btn-ghost" onclick="Access.lock()">Lock program</button>
  </div>`;
};

Access.addCoachForm = function () {
  const gate = document.getElementById('access-gate');
  gate.innerHTML = `<form class="coach-create-card" onsubmit="Access.createCoach(event)">
    <button class="close-x" type="button" onclick="Access.renderCoachPicker()">&times;</button>
    <div class="kicker">NEW TEAM PROFILE</div><h2>Add a coach</h2>
    <label class="field"><span>Coach name</span><input id="new-coach-name" required autofocus></label>
    <label class="field"><span>Role or specialty</span><input id="new-coach-role" placeholder="Head coach, tracking specialist..."></label>
    <div class="modal-foot"><button class="btn btn-ghost" type="button" onclick="Access.renderCoachPicker()">Cancel</button><button class="btn btn-primary">Add coach</button></div>
  </form>`;
};

Access.createCoach = function (event) {
  event.preventDefault();
  const coach = {
    id: uid(),
    name: document.getElementById('new-coach-name').value.trim(),
    role: document.getElementById('new-coach-role').value.trim(),
    color: ['#f0a11a', '#55c2ff', '#72d99f', '#c395ff', '#ff7b72'][DB.coaches.length % 5],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  DB.coaches.push(coach);
  saveDB();
  Access.chooseCoach(coach.id);
};

Access.chooseCoach = function (id) {
  if (!(DB.coaches || []).some(c => c.id === id)) return;
  Access.currentCoachId = id;
  document.getElementById('access-gate').classList.remove('show');
  Access.updateNav();
  if (Access._coachResolve) {
    const resolve = Access._coachResolve;
    Access._coachResolve = null;
    resolve(id);
  } else if (typeof UI !== 'undefined' && UI.refresh) {
    UI.refresh();
  }
};

Access.selectCoach = function (id) {
  Access.chooseCoach(id);
  if (typeof UI !== 'undefined' && UI.toast) UI.toast(`Now coaching as ${Access.current().name}.`, 'good');
};

Access.current = () => (DB.coaches || []).find(c => c.id === Access.currentCoachId) || null;
Access.initials = name => String(name || '').split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();

Access.updateNav = function () {
  const select = document.getElementById('nav-coach-select');
  if (!select) return;
  select.innerHTML = (DB.coaches || []).map(c => `<option value="${c.id}" ${c.id === Access.currentCoachId ? 'selected' : ''}>${UI.escape(c.name)}</option>`).join('');
};

Access.lock = async function () {
  try { await window.api.coachLock(); } catch (e) {}
  Access.unlocked = false;
  Access.currentCoachId = null;
  location.reload();
};

function currentCoach() { return Access.current(); }
