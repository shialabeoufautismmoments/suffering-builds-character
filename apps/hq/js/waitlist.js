/* =============================================================================
   WAITLIST -a stripped-down roster of prospective clients (leads). Keeps the
   main client roster clean; "Convert" promotes a paid lead to an active client.
   ============================================================================= */
const Waitlist = {};

UI.renderers.waitlist = function (el) {
  const leads = (DB.leads || []).slice().sort((a, b) => (b.contactDate || '').localeCompare(a.contactDate || ''));

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Waitlist</h1><div class="sub">Prospective clients. Convert one to the active roster once they've paid.</div></div>
      <button class="btn btn-primary" onclick="Waitlist.edit()">+ Add Lead</button>
    </div>
    ${leads.length ? `<div class="card"><table class="data">
      <thead><tr><th>Discord</th><th>Name</th><th>Requested Rank</th><th>Contacted</th><th>Notes</th><th></th></tr></thead>
      <tbody>${leads.map(l => `<tr>
        <td><b>${UI.escape(l.discord || '-')}</b></td>
        <td>${UI.escape(l.name || '-')}</td>
        <td>${UI.escape(l.rank || '-')}</td>
        <td class="muted">${l.contactDate ? UI.fmtDate(l.contactDate) : '-'}</td>
        <td class="muted" style="max-width:280px">${UI.escape(l.notes || '')}</td>
        <td style="white-space:nowrap;text-align:right">
          <button class="btn btn-xs btn-primary" onclick="Waitlist.convert('${l.id}')" title="Promote to the active roster">->Convert</button>
          <button class="btn btn-xs btn-ghost" onclick="Waitlist.edit('${l.id}')">Edit</button>
          <button class="btn btn-xs btn-danger" onclick="Waitlist.remove('${l.id}')">x</button>
        </td></tr>`).join('')}</tbody></table></div>`
      : UI.emptyState('📝', 'No leads on the waitlist', 'Add prospective clients here to keep them separate from your paying roster.')}`;
};

Waitlist.edit = function (id) {
  const l = id ? DB.leads.find(x => x.id === id) : null;
  const f = (k, d = '') => UI.escape(l ? (l[k] ?? d) : d);
  UI.modal(`
    <div class="modal-head"><h2>${l ? 'Edit Lead' : 'Add Lead'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row">
      <label class="field"><span>Discord tag</span><input id="l-discord" value="${f('discord')}" placeholder="username or user#0000"></label>
      <label class="field"><span>Name / gamertag (optional)</span><input id="l-name" value="${f('name')}" placeholder="Player name"></label>
    </div>
    <div class="row">
      <label class="field"><span>Game</span><select id="l-game">
        ${['Overwatch 2', 'Valorant', 'Apex Legends', 'CS2', 'The Finals', 'Other'].map(g => `<option ${l && l.game === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></label>
      <label class="field"><span>Requested rank</span><input id="l-rank" value="${f('rank')}" placeholder="e.g. Diamond"></label>
      <label class="field"><span>Contact date</span><input id="l-contactDate" type="date" value="${f('contactDate', UI.today())}"></label>
    </div>
    <label class="field"><span>Notes</span><textarea id="l-notes" placeholder="What they want, availability, budget...">${f('notes')}</textarea></label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Waitlist.save('${id || ''}')">${l ? 'Save' : 'Add Lead'}</button>
    </div>`);
};

Waitlist.save = function (id) {
  const get = k => document.getElementById('l-' + k).value.trim();
  const data = { discord: get('discord'), name: get('name'), game: get('game'), rank: get('rank'), contactDate: get('contactDate') || UI.today(), notes: get('notes') };
  if (!data.discord && !data.name) { UI.toast('Add a Discord tag or name.', 'bad'); return; }
  if (id) Object.assign(DB.leads.find(x => x.id === id), data);
  else (DB.leads ||= []).push({ id: uid(), ...data, createdAt: new Date().toISOString() });
  saveDB();
  UI.closeModal();
  UI.toast('Lead saved.', 'good');
  UI.refresh();
};

Waitlist.remove = function (id) {
  const l = DB.leads.find(x => x.id === id);
  UI.confirm(`Remove ${l.discord || l.name || 'this lead'} from the waitlist?`, () => {
    DB.leads = DB.leads.filter(x => x.id !== id);
    saveDB(); UI.toast('Lead removed.'); UI.refresh();
  });
};

Waitlist.convert = function (id) {
  const l = DB.leads.find(x => x.id === id);
  if (!l) return;
  const name = l.name || l.discord || 'New Client';
  UI.confirm(`Convert "${name}" to an active, paying client? They'll move off the waitlist onto your main roster.`, () => {
    const c = {
      id: uid(), name, game: l.game || 'Overwatch 2', rank: l.rank || '',
      discord: l.discord || '', dpi: '', sens: '', cm360: '', notes: l.notes || '',
      goals: [], heroes: [], prs: {}, activity: {}, createdAt: new Date().toISOString(),
    };
    DB.clients.push(c);
    DB.leads = DB.leads.filter(x => x.id !== id);
    DB.activeClientId = c.id;
    saveDB();
    UI.updateClientPill();
    UI.toast(`${name} is now an active client.`, 'good');
    App.nav('dashboard');
  }, { danger: false, yes: 'Convert' });
};


