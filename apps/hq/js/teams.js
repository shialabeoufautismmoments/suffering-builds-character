/* =============================================================================
   TEAM WORKSPACES - shared rosters, goals, scrims, map pools, and compositions.
   ============================================================================= */
const Teams = {};

Teams.all = () => (DB.teams || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
Teams.find = id => (DB.teams || []).find(team => team.id === id) || null;
Teams.clients = team => (team.clientIds || []).map(getClient).filter(client => client && !clientIsArchived(client));
Teams.coaches = team => (team.coachIds || []).map(id => (DB.coaches || []).find(coach => coach.id === id)).filter(Boolean);
Teams.touch = team => { team.updatedAt = new Date().toISOString(); saveDB(); UI.refresh(); };

UI.renderers.teams = function (el) {
  const teams = Teams.all();
  const rostered = new Set(teams.flatMap(team => Teams.clients(team).map(client => client.id))).size;
  const upcoming = teams.flatMap(team => team.scrims || []).filter(scrim => scrim.date >= UI.today() && scrim.status !== 'Completed').length;
  el.innerHTML = `<div class="page-head"><div><div class="kicker">TEAM COACHING</div><h1>Team Workspaces</h1><div class="sub">Shared rosters, objectives, scrims, map pools, and compositions for every coached squad.</div></div><button class="btn btn-primary" onclick="Teams.edit()">+ New team</button></div>
    <div class="stat-tiles mb"><div class="stat-tile"><div class="label">Teams</div><div class="value">${teams.length}</div></div><div class="stat-tile"><div class="label">Rostered players</div><div class="value accent">${rostered}</div></div><div class="stat-tile"><div class="label">Upcoming scrims</div><div class="value">${upcoming}</div></div></div>
    ${teams.length ? `<div class="team-workspace-list">${teams.map(Teams.card).join('')}</div>` : UI.emptyState('TEAM', 'No team workspaces yet', 'Create a team, assign existing clients and coaches, then build its shared plan.')}`;
};

Teams.card = function (team) {
  const members = Teams.clients(team);
  const coaches = Teams.coaches(team);
  const openGoals = (team.goals || []).filter(goal => !goal.done);
  const scrims = (team.scrims || []).slice().sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
  return `<article class="team-workspace-card">
    <div class="team-workspace-head"><div><div class="kicker">${UI.escape([team.game, team.division, team.season].filter(Boolean).join(' · ') || 'COACHED TEAM')}</div><h2>${UI.escape(team.name)}</h2><p>${UI.escape(team.objective || 'No shared objective set yet.')}</p></div><div class="flex gap-sm wrap"><button class="btn btn-sm" onclick="Teams.edit('${UI.attr(team.id)}')">Edit team</button><button class="btn btn-sm btn-danger" onclick="Teams.remove('${UI.attr(team.id)}')">Remove</button></div></div>
    <div class="team-summary-grid"><div><span>Roster</span><b>${members.length}</b><p>${members.length ? members.map(client => UI.escape(client.name)).join(', ') : 'No players assigned'}</p></div><div><span>Coaches</span><b>${coaches.length}</b><p>${coaches.length ? coaches.map(coach => UI.escape(coach.name)).join(', ') : 'No coaches assigned'}</p></div><div><span>Open goals</span><b>${openGoals.length}</b><p>${openGoals.slice(0, 2).map(goal => UI.escape(goal.text)).join(', ') || 'No open goals'}</p></div><div><span>Next scrim</span><b>${scrims.find(scrim => scrim.date >= UI.today() && scrim.status !== 'Completed') ? UI.fmtDate(scrims.find(scrim => scrim.date >= UI.today() && scrim.status !== 'Completed').date) : '—'}</b><p>${UI.escape((scrims.find(scrim => scrim.date >= UI.today() && scrim.status !== 'Completed') || {}).opponent || 'Nothing scheduled')}</p></div></div>
    <div class="team-workspace-sections">
      ${Teams.section(team, 'Shared goals', 'goal', (team.goals || []).map(goal => `<div class="team-item ${goal.done ? 'done' : ''}"><div><b>${UI.escape(goal.text)}</b><small>${[goal.owner, goal.dueDate ? `Due ${UI.fmtDate(goal.dueDate)}` : '', goal.done ? 'Completed' : 'Open'].filter(Boolean).map(UI.escape).join(' · ')}</small></div><div class="flex gap-sm"><button class="btn btn-xs ${goal.done ? 'btn-ghost' : 'btn-primary'}" onclick="Teams.toggleGoal('${UI.attr(team.id)}','${UI.attr(goal.id)}')">${goal.done ? 'Reopen' : 'Complete'}</button><button class="btn btn-xs" onclick="Teams.goalEdit('${UI.attr(team.id)}','${UI.attr(goal.id)}')">Edit</button><button class="btn btn-xs btn-danger" onclick="Teams.removeItem('${UI.attr(team.id)}','goals','${UI.attr(goal.id)}')">×</button></div></div>`).join(''), 'Add goal')}
      ${Teams.section(team, 'Scrim schedule', 'scrim', scrims.map(scrim => `<div class="team-item"><div><b>${UI.escape(scrim.opponent || 'Scrim')}</b><small>${[UI.fmtDate(scrim.date), scrim.time, scrim.format, scrim.status, scrim.result].filter(Boolean).map(UI.escape).join(' · ')}</small>${scrim.mapPool ? `<p>${UI.escape(scrim.mapPool)}</p>` : ''}</div><div class="flex gap-sm"><button class="btn btn-xs" onclick="Teams.scrimEdit('${UI.attr(team.id)}','${UI.attr(scrim.id)}')">Edit</button><button class="btn btn-xs btn-danger" onclick="Teams.removeItem('${UI.attr(team.id)}','scrims','${UI.attr(scrim.id)}')">×</button></div></div>`).join(''), 'Add scrim')}
      ${Teams.section(team, 'Map pool', 'map', (team.mapPool || []).map(entry => `<div class="team-item"><div><b>${UI.escape(entry.map)}</b><small>${[entry.priority, entry.attackComp ? `Attack: ${entry.attackComp}` : '', entry.defenseComp ? `Defense: ${entry.defenseComp}` : ''].filter(Boolean).map(UI.escape).join(' · ')}</small>${entry.notes ? `<p>${UI.escape(entry.notes)}</p>` : ''}</div><div class="flex gap-sm"><button class="btn btn-xs" onclick="Teams.mapEdit('${UI.attr(team.id)}','${UI.attr(entry.id)}')">Edit</button><button class="btn btn-xs btn-danger" onclick="Teams.removeItem('${UI.attr(team.id)}','mapPool','${UI.attr(entry.id)}')">×</button></div></div>`).join(''), 'Add map')}
      ${Teams.section(team, 'Compositions', 'composition', (team.compositions || []).map(comp => `<div class="team-item"><div><b>${UI.escape(comp.name)}</b><small>${[comp.map, comp.mode].filter(Boolean).map(UI.escape).join(' · ')}</small>${comp.lineup ? `<p>${UI.escape(comp.lineup)}</p>` : ''}</div><div class="flex gap-sm"><button class="btn btn-xs" onclick="Teams.compositionEdit('${UI.attr(team.id)}','${UI.attr(comp.id)}')">Edit</button><button class="btn btn-xs btn-danger" onclick="Teams.removeItem('${UI.attr(team.id)}','compositions','${UI.attr(comp.id)}')">×</button></div></div>`).join(''), 'Add composition')}
    </div>
  </article>`;
};

Teams.section = function (team, title, kind, body, button) {
  const action = kind === 'goal' ? 'goalEdit' : kind === 'scrim' ? 'scrimEdit' : kind === 'map' ? 'mapEdit' : 'compositionEdit';
  return `<section class="team-workspace-section"><div class="card-head"><h3>${title}</h3><button class="btn btn-xs btn-primary" onclick="Teams.${action}('${UI.attr(team.id)}')">+ ${button}</button></div>${body || '<p class="muted small">Nothing added yet.</p>'}</section>`;
};

Teams.edit = function (id = '') {
  const team = id ? Teams.find(id) : null;
  const f = key => UI.escape(team?.[key] || '');
  const memberIds = new Set(team?.clientIds || []);
  const coachIds = new Set(team?.coachIds || []);
  const roster = activeClients();
  UI.modal(`<div class="modal-head"><div><h2>${team ? 'Edit team workspace' : 'Create team workspace'}</h2><p class="muted">Members see the shared plan in their Client App.</p></div><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row"><label class="field"><span>Team name</span><input id="team-name" value="${f('name')}" placeholder="Academy Squad"></label><label class="field"><span>Game</span><input id="team-game" value="${f('game')}" placeholder="Overwatch 2"></label></div>
    <div class="row"><label class="field"><span>Division / level</span><input id="team-division" value="${f('division')}" placeholder="Open Division"></label><label class="field"><span>Season</span><input id="team-season" value="${f('season')}" placeholder="2026 Stage 3"></label></div>
    <label class="field"><span>Shared objective</span><textarea id="team-objective" placeholder="The result this team is working toward.">${f('objective')}</textarea></label>
    <div class="row"><fieldset class="team-picker"><legend>Roster</legend>${roster.length ? roster.slice().sort((a,b) => a.name.localeCompare(b.name)).map(client => `<label><input class="team-member-check" type="checkbox" value="${UI.escape(client.id)}" ${memberIds.has(client.id) ? 'checked' : ''}><span>${UI.escape(client.name)} <small>${UI.escape(client.role || client.rank || '')}</small></span></label>`).join('') : '<p class="muted">Add or restore an active client first.</p>'}</fieldset>
    <fieldset class="team-picker"><legend>Coaches</legend>${(DB.coaches || []).length ? (DB.coaches || []).map(coach => `<label><input class="team-coach-check" type="checkbox" value="${UI.escape(coach.id)}" ${coachIds.has(coach.id) ? 'checked' : ''}><span>${UI.escape(coach.name)} <small>${UI.escape(coach.role || '')}</small></span></label>`).join('') : '<p class="muted">Add coach profiles first.</p>'}</fieldset></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Teams.save('${UI.escape(id)}')">Save team</button></div>`, { wide: true });
};

Teams.save = function (id = '') {
  const name = document.getElementById('team-name').value.trim();
  if (!name) return UI.toast('Add a team name.', 'bad');
  const now = new Date().toISOString();
  const current = id ? Teams.find(id) : null;
  const team = current || { id: uid(), goals: [], scrims: [], mapPool: [], compositions: [], createdAt: now };
  const oldName = team.name || '';
  const archivedMemberIds = (current?.clientIds || []).filter(clientId => clientIsArchived(getClient(clientId)));
  const clientIds = [...new Set([...document.querySelectorAll('.team-member-check:checked')].map(input => input.value).concat(archivedMemberIds))];
  Object.assign(team, {
    name, game: document.getElementById('team-game').value.trim(), division: document.getElementById('team-division').value.trim(),
    season: document.getElementById('team-season').value.trim(), objective: document.getElementById('team-objective').value.trim(),
    clientIds, coachIds: [...document.querySelectorAll('.team-coach-check:checked')].map(input => input.value), updatedAt: now,
  });
  if (!current) (DB.teams ||= []).push(team);
  (DB.teams || []).filter(other => other.id !== team.id).forEach(other => {
    other.clientIds = (other.clientIds || []).filter(clientId => !clientIds.includes(clientId));
  });
  DB.clients.forEach(client => {
    if (clientIds.includes(client.id)) { client.teamId = team.id; client.team = name; }
    else if (client.teamId === team.id) { client.teamId = ''; if (client.team === oldName) client.team = ''; }
  });
  saveDB(); UI.closeModal(); UI.toast('Team workspace saved.', 'good'); UI.refresh();
};

Teams.remove = function (id) {
  const team = Teams.find(id); if (!team) return;
  UI.confirm(`Remove the ${team.name} workspace? Its shared goals, scrims, map pool, and compositions will be removed.`, () => {
    DB.teams = (DB.teams || []).filter(item => item.id !== id);
    DB.clients.forEach(client => { if (client.teamId === id) { client.teamId = ''; if (client.team === team.name) client.team = ''; } });
    saveDB(); UI.toast('Team workspace removed.'); UI.refresh();
  });
};

Teams.goalEdit = function (teamId, id = '') {
  const team = Teams.find(teamId); const goal = (team?.goals || []).find(item => item.id === id); if (!team) return;
  UI.modal(`<div class="modal-head"><h2>${goal ? 'Edit' : 'Add'} team goal</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div><label class="field"><span>Goal</span><input id="tg-text" value="${UI.escape(goal?.text || '')}" placeholder="Improve first-fight win rate"></label><div class="row"><label class="field"><span>Owner</span><input id="tg-owner" value="${UI.escape(goal?.owner || '')}" placeholder="Whole team or player name"></label><label class="field"><span>Due date</span><input id="tg-due" type="date" value="${UI.escape(goal?.dueDate || '')}"></label></div><label class="feedback-check"><input id="tg-done" type="checkbox" ${goal?.done ? 'checked' : ''}><span>Completed</span></label><div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Teams.goalSave('${UI.attr(teamId)}','${UI.attr(id)}')">Save goal</button></div>`);
};
Teams.goalSave = function (teamId, id = '') {
  const team = Teams.find(teamId); const text = document.getElementById('tg-text').value.trim(); if (!team || !text) return UI.toast('Add a goal.', 'bad');
  team.goals ||= []; const current = team.goals.find(item => item.id === id); const data = { id: current?.id || uid(), text, owner: document.getElementById('tg-owner').value.trim(), dueDate: document.getElementById('tg-due').value, done: document.getElementById('tg-done').checked, updatedAt: new Date().toISOString() };
  if (current) Object.assign(current, data); else team.goals.push(data); UI.closeModal(); Teams.touch(team);
};
Teams.toggleGoal = function (teamId, id) { const team = Teams.find(teamId); const goal = (team?.goals || []).find(item => item.id === id); if (!goal) return; goal.done = !goal.done; goal.updatedAt = new Date().toISOString(); Teams.touch(team); };

Teams.scrimEdit = function (teamId, id = '') {
  const team = Teams.find(teamId); const item = (team?.scrims || []).find(scrim => scrim.id === id); if (!team) return;
  const f = key => UI.escape(item?.[key] || '');
  UI.modal(`<div class="modal-head"><h2>${item ? 'Edit' : 'Schedule'} scrim</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div><div class="row"><label class="field"><span>Date</span><input id="ts-date" type="date" value="${f('date')}"></label><label class="field"><span>Time</span><input id="ts-time" type="time" value="${f('time')}"></label><label class="field"><span>Opponent</span><input id="ts-opponent" value="${f('opponent')}"></label></div><div class="row"><label class="field"><span>Format</span><input id="ts-format" value="${f('format')}" placeholder="Best of 5"></label><label class="field"><span>Status</span><select id="ts-status">${['Scheduled','Confirmed','Completed','Cancelled'].map(value => `<option ${value === (item?.status || 'Scheduled') ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label class="field"><span>Result</span><input id="ts-result" value="${f('result')}" placeholder="3–1"></label></div><label class="field"><span>Map pool</span><input id="ts-maps" value="${f('mapPool')}" placeholder="King's Row, Ilios, Runasapi"></label><label class="field"><span>Notes</span><textarea id="ts-notes">${f('notes')}</textarea></label><div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Teams.scrimSave('${UI.attr(teamId)}','${UI.attr(id)}')">Save scrim</button></div>`, { wide: true });
};
Teams.scrimSave = function (teamId, id = '') {
  const team = Teams.find(teamId); const date = document.getElementById('ts-date').value; if (!team || !date) return UI.toast('Choose a scrim date.', 'bad'); team.scrims ||= []; const current = team.scrims.find(item => item.id === id);
  const data = { id: current?.id || uid(), date, time: document.getElementById('ts-time').value, opponent: document.getElementById('ts-opponent').value.trim(), format: document.getElementById('ts-format').value.trim(), status: document.getElementById('ts-status').value, result: document.getElementById('ts-result').value.trim(), mapPool: document.getElementById('ts-maps').value.trim(), notes: document.getElementById('ts-notes').value.trim(), updatedAt: new Date().toISOString() };
  if (current) Object.assign(current, data); else team.scrims.push(data); UI.closeModal(); Teams.touch(team);
};

Teams.mapEdit = function (teamId, id = '') {
  const team = Teams.find(teamId); const item = (team?.mapPool || []).find(entry => entry.id === id); if (!team) return; const maps = typeof OW_MAPS !== 'undefined' ? OW_MAPS : [];
  const f = key => UI.escape(item?.[key] || '');
  UI.modal(`<div class="modal-head"><h2>${item ? 'Edit' : 'Add'} map plan</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div><div class="row"><label class="field"><span>Map</span><input id="tm-map" list="team-map-options" value="${f('map')}"><datalist id="team-map-options">${maps.map(map => `<option value="${UI.escape(map.name)}">${UI.escape(map.mode)}</option>`).join('')}</datalist></label><label class="field"><span>Priority</span><select id="tm-priority">${['Core','Practice','Situational','Avoid'].map(value => `<option ${value === (item?.priority || 'Practice') ? 'selected' : ''}>${value}</option>`).join('')}</select></label></div><div class="row"><label class="field"><span>Attack composition</span><input id="tm-attack" value="${f('attackComp')}"></label><label class="field"><span>Defense composition</span><input id="tm-defense" value="${f('defenseComp')}"></label></div><label class="field"><span>Plan / notes</span><textarea id="tm-notes">${f('notes')}</textarea></label><div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Teams.mapSave('${UI.attr(teamId)}','${UI.attr(id)}')">Save map</button></div>`);
};
Teams.mapSave = function (teamId, id = '') {
  const team = Teams.find(teamId); const map = document.getElementById('tm-map').value.trim(); if (!team || !map) return UI.toast('Choose a map.', 'bad'); team.mapPool ||= []; const current = team.mapPool.find(item => item.id === id);
  const data = { id: current?.id || uid(), map, priority: document.getElementById('tm-priority').value, attackComp: document.getElementById('tm-attack').value.trim(), defenseComp: document.getElementById('tm-defense').value.trim(), notes: document.getElementById('tm-notes').value.trim(), updatedAt: new Date().toISOString() };
  if (current) Object.assign(current, data); else team.mapPool.push(data); UI.closeModal(); Teams.touch(team);
};

Teams.compositionEdit = function (teamId, id = '') {
  const team = Teams.find(teamId); const item = (team?.compositions || []).find(comp => comp.id === id); if (!team) return; const f = key => UI.escape(item?.[key] || '');
  UI.modal(`<div class="modal-head"><h2>${item ? 'Edit' : 'Add'} composition</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div><div class="row"><label class="field"><span>Name</span><input id="tc-name" value="${f('name')}" placeholder="Rush core"></label><label class="field"><span>Map</span><input id="tc-map" value="${f('map')}" placeholder="All maps or a specific map"></label><label class="field"><span>Mode</span><input id="tc-mode" value="${f('mode')}" placeholder="Hybrid"></label></div><label class="field"><span>Lineup</span><input id="tc-lineup" value="${f('lineup')}" placeholder="Reinhardt, Mei, Cassidy, Lucio, Baptiste"></label><label class="field"><span>Win condition / notes</span><textarea id="tc-notes">${f('notes')}</textarea></label><div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Teams.compositionSave('${UI.attr(teamId)}','${UI.attr(id)}')">Save composition</button></div>`, { wide: true });
};
Teams.compositionSave = function (teamId, id = '') {
  const team = Teams.find(teamId); const name = document.getElementById('tc-name').value.trim(); if (!team || !name) return UI.toast('Add a composition name.', 'bad'); team.compositions ||= []; const current = team.compositions.find(item => item.id === id);
  const data = { id: current?.id || uid(), name, map: document.getElementById('tc-map').value.trim(), mode: document.getElementById('tc-mode').value.trim(), lineup: document.getElementById('tc-lineup').value.trim(), notes: document.getElementById('tc-notes').value.trim(), updatedAt: new Date().toISOString() };
  if (current) Object.assign(current, data); else team.compositions.push(data); UI.closeModal(); Teams.touch(team);
};

Teams.removeItem = function (teamId, key, id) {
  const team = Teams.find(teamId); if (!team || !['goals','scrims','mapPool','compositions'].includes(key)) return;
  UI.confirm('Remove this team-workspace item?', () => { team[key] = (team[key] || []).filter(item => item.id !== id); Teams.touch(team); });
};
