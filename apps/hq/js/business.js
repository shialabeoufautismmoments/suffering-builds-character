/* =============================================================================
   BUSINESS -session packages (purchased/used/paid), revenue overview, and an
   upcoming-session scheduler.
   ============================================================================= */
const Business = {};

Business.money = (n) => '$' + UI.fmtNumber(Math.round((+n || 0) * 100) / 100);

Business.clientRemaining = function (c) {
  return (c.packages || []).reduce((s, p) => s + Math.max(0, (+p.total || 0) - (+p.used || 0)), 0);
};
Business.nextSession = function (clientId) {
  const today = UI.today();
  return (DB.scheduled || []).filter(s => s.clientId === clientId && !s.done && s.date >= today)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;
};
Business.templatesHtml = function (client) {
  const templates = DB.packageTemplates || [];
  return `<div class="card mb">
    <div class="card-head"><div><h2>Package Templates</h2><div class="muted" style="font-size:.74rem">Reusable offers you can apply to any active client.</div></div>
      <button class="btn btn-sm btn-primary" onclick="Business.templateEdit()">+ New Template</button></div>
    ${templates.length ? `<div class="package-template-grid">${templates.map(t => `
      <div class="package-template">
        <div><b>${UI.escape(t.name)}</b><div class="muted" style="font-size:.76rem">${Math.max(0, +t.total || 0)} sessions - ${Business.money(t.price)}${t.description ? ` - ${UI.escape(t.description)}` : ''}</div></div>
        <div class="flex gap-sm wrap">
          <button class="btn btn-xs btn-primary" onclick="Business.templateApply('${t.id}')" ${client ? '' : 'disabled'}>Apply${client ? ` to ${UI.escape(client.name)}` : ''}</button>
          <button class="btn btn-xs btn-ghost" onclick="Business.templateEdit('${t.id}')">Edit</button>
          <button class="btn btn-xs btn-danger" onclick="Business.templateRemove('${t.id}')">x</button>
        </div>
      </div>`).join('')}</div>` : '<div class="muted" style="font-size:.82rem">Create package templates once, then apply them across your roster.</div>'}
  </div>`;
};

UI.renderers.business = function (el) {
  const allPkgs = DB.clients.flatMap(c => (c.packages || []).map(p => ({ ...p, client: c })));
  const collected = allPkgs.filter(p => p.paid).reduce((s, p) => s + (+p.price || 0), 0);
  const outstanding = allPkgs.filter(p => !p.paid).reduce((s, p) => s + (+p.price || 0), 0);
  const remaining = DB.clients.reduce((s, c) => s + Business.clientRemaining(c), 0);

  const today = UI.today();
  const sched = (DB.scheduled || []).slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const upcoming = sched.filter(s => !s.done && s.date >= today);
  const past = sched.filter(s => s.done || s.date < today).reverse();
  const c = activeClient();

  const schedRow = (s) => {
    const cl = getClient(s.clientId);
    const isToday = s.date === today && !s.done;
    const who = cl ? UI.escape(cl.name) : (s.source === 'cal' ? '<span class="muted">Cal.com booking</span>' : '-');
    return `<tr style="${isToday ? 'background:var(--accent-soft)' : s.done || s.date < today ? 'opacity:.55' : ''}">
      <td class="muted" style="white-space:nowrap">${UI.fmtDate(s.date)}${s.time ? ' - ' + UI.escape(s.time) : ''}${s.source === 'cal' ? ' <span class="tag" style="padding:0 .35rem" title="Synced from Cal.com">📅</span>' : ''}${isToday ? ' <span class="tag accent" style="padding:0 .4rem">TODAY</span>' : ''}</td>
      <td><b>${who}</b></td>
      <td class="muted">${UI.escape(s.notes || '')}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-xs btn-ghost" onclick="Business.toggleDone('${s.id}')">${s.done ? 'Undo' : '*Done'}</button>
        <button class="btn btn-xs btn-ghost" onclick="Business.scheduleEdit('${s.id}')">Edit</button>
        <button class="btn btn-xs btn-danger" onclick="Business.scheduleRemove('${s.id}')">x</button>
      </td></tr>`;
  };

  const pkgs = c ? (c.packages || []) : [];
  const view = Business.schedView || 'list';

  const scheduleHead = `<div class="card-head"><h2>Schedule</h2>
    <div class="flex gap-sm center">
      <div class="seg"><button class="${view === 'list' ? 'on' : ''}" onclick="Business.setSchedView('list')">List</button><button class="${view === 'calendar' ? 'on' : ''}" onclick="Business.setSchedView('calendar')">Calendar</button></div>
      <button class="btn btn-sm btn-primary" onclick="Business.scheduleEdit()">+ Schedule</button>
    </div></div>`;
  const scheduleBody = view === 'calendar' ? Business.calendarHtml() : `
    ${upcoming.length ? `<table class="data"><thead><tr><th>When</th><th>Client</th><th>Notes</th><th></th></tr></thead><tbody>${upcoming.map(schedRow).join('')}</tbody></table>`
      : '<div class="muted" style="font-size:.84rem">No upcoming sessions scheduled.</div>'}
    ${past.length ? `<div class="divider"></div><div class="muted" style="font-size:.74rem;margin-bottom:.3rem">Past / done</div>
      <table class="data"><tbody>${past.slice(0, 6).map(schedRow).join('')}</tbody></table>` : ''}`;
  const scheduleCard = `<div class="card${view === 'calendar' ? ' mb' : ''}">${scheduleHead}${scheduleBody}</div>`;

  const packagesCard = `<div class="card">
      <div class="card-head"><h2>Packages${c ? ' -' + UI.escape(c.name) : ''}</h2>${c ? `<button class="btn btn-sm btn-primary" onclick="Business.pkgEdit()">+ Add Package</button>` : ''}</div>
      ${!c ? '<div class="muted" style="font-size:.84rem">Select a client to manage their packages.</div>'
        : pkgs.length ? pkgs.map(p => {
          const left = Math.max(0, (+p.total || 0) - (+p.used || 0));
          return `<div style="padding:.6rem 0;border-bottom:1px solid var(--border-soft)">
            <div class="flex between center">
              <div><b>${UI.escape(p.name || 'Package')}</b> <span class="muted" style="font-size:.78rem">- ${Business.money(p.price)}</span>
                <span class="pill ${p.paid ? 'good' : 'mistake'}" style="margin-left:.3rem;cursor:pointer" onclick="Business.togglePaid('${p.id}')">${p.paid ? 'PAID' : 'UNPAID'}</span></div>
              <div class="flex gap-sm"><button class="btn btn-xs btn-ghost" onclick="Business.invoice('${c.id}','${p.id}')" title="Invoice / receipt PDF">🧾</button><button class="btn btn-xs btn-ghost" onclick="Business.pkgEdit('${p.id}')">Edit</button><button class="btn btn-xs btn-danger" onclick="Business.pkgRemove('${p.id}')">x</button></div>
            </div>
            <div class="flex center gap-sm mt-sm">
              <span class="muted" style="font-size:.8rem">Used</span>
              <button class="btn btn-xs" onclick="Business.useDelta('${p.id}',-1)">-</button>
              <span style="font-variant-numeric:tabular-nums">${p.used || 0} / ${p.total || 0}</span>
              <button class="btn btn-xs" onclick="Business.useDelta('${p.id}',1)">+</button>
              <span class="muted" style="font-size:.8rem">- <b style="color:${left ? 'var(--accent)' : 'var(--bad)'}">${left} left</b></span>
            </div>
          </div>`;
        }).join('') : '<div class="muted" style="font-size:.84rem">No packages. Add one when the client buys a block of sessions.</div>'}
    </div>`;

  el.innerHTML = `
    <div class="page-head"><div><h1>Business</h1><div class="sub">Packages, payments, and your coaching schedule.</div></div></div>
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="label">Collected</div><div class="value text-good">${Business.money(collected)}</div></div>
      <div class="stat-tile"><div class="label">Outstanding</div><div class="value" style="color:${outstanding ? 'var(--warn)' : 'var(--text-dim)'}">${Business.money(outstanding)}</div></div>
      <div class="stat-tile"><div class="label">Sessions Remaining</div><div class="value accent">${remaining}</div></div>
      <div class="stat-tile"><div class="label">Upcoming</div><div class="value">${upcoming.length}</div></div>
    </div>
    ${Business.templatesHtml(c)}
    ${typeof Cal !== 'undefined' ? Cal.businessCard(c) : ''}
    ${view === 'calendar' ? scheduleCard + packagesCard : `<div class="grid cols-2">${scheduleCard}${packagesCard}</div>`}`;
};

Business.setSchedView = function (v) { Business.schedView = v; UI.refresh(); };
Business.calOffset = 0;
Business.calNav = function (d) { Business.calOffset += d; UI.refresh(); };

Business.calendarHtml = function () {
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + Business.calOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const monthName = UI.fmtMonthYear(base);
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const pad = n => String(n).padStart(2, '0');
  const today = UI.today();
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${year}-${pad(month + 1)}-${pad(d)}`;
    const evs = (DB.scheduled || []).filter(s => s.date === ds).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    cells += `<div class="cal-cell ${ds === today ? 'today' : ''}" ondblclick="Business.scheduleEdit('','${ds}')">
      <div class="cal-day">${d}</div>
      ${evs.map(s => { const cl = getClient(s.clientId); const label = cl ? cl.name : (s.source === 'cal' ? '📅 Cal.com' : '-'); return `<div class="cal-ev ${s.done ? 'done' : ''}" onclick="event.stopPropagation();Business.scheduleEdit('${s.id}')" title="${UI.escape((cl ? cl.name : '') + ' ' + (s.time || '') + ' ' + (s.notes || ''))}">${s.time ? UI.escape(s.time) + ' ' : ''}${UI.escape(label)}</div>`; }).join('')}
    </div>`;
  }
  return `<div class="flex between center mb">
      <button class="btn btn-sm btn-ghost" onclick="Business.calNav(-1)">< Prev</button>
      <b>${monthName}</b>
      <button class="btn btn-sm btn-ghost" onclick="Business.calNav(1)">Next ></button></div>
    <div class="cal-grid">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}</div>
    <p class="muted" style="font-size:.72rem;margin-top:.4rem">Double-click a day to schedule - click a session to edit.</p>`;
};

/* -- Scheduling ------------------------------------------------------------- */
Business.scheduleEdit = function (id, presetDate) {
  const s = id ? DB.scheduled.find(x => x.id === id) : null;
  const f = (k, d = '') => UI.escape(s ? (s[k] ?? d) : d);
  if (!DB.clients.length) { UI.toast('Add a client first.', 'bad'); return; }
  UI.modal(`
    <div class="modal-head"><h2>${s ? 'Edit' : 'Schedule'} Session</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>Client</span><select id="sc-client">${DB.clients.map(c => `<option value="${c.id}" ${(s ? s.clientId : DB.activeClientId) === c.id ? 'selected' : ''}>${UI.escape(c.name)}</option>`).join('')}</select></label>
    <div class="row">
      <label class="field"><span>Date</span><input id="sc-date" type="date" value="${s ? UI.escape(s.date) : (presetDate || UI.today())}"></label>
      <label class="field"><span>Time</span><input id="sc-time" type="time" value="${f('time')}"></label>
      ${s ? '' : '<label class="field"><span>Repeat weekly (x weeks)</span><input id="sc-repeat" type="number" value="1" min="1"></label>'}
    </div>
    <label class="field"><span>Notes</span><textarea id="sc-notes" placeholder="Focus for the session...">${f('notes')}</textarea></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Business.scheduleSave('${id || ''}')">${s ? 'Save' : 'Schedule'}</button></div>`);
};
Business.scheduleSave = function (id) {
  const data = { clientId: document.getElementById('sc-client').value, date: document.getElementById('sc-date').value || UI.today(), time: document.getElementById('sc-time').value, notes: document.getElementById('sc-notes').value.trim() };
  if (id) { Object.assign(DB.scheduled.find(x => x.id === id), data); }
  else {
    DB.scheduled ||= [];
    const repeat = Math.max(1, Math.min(52, parseInt((document.getElementById('sc-repeat') || {}).value) || 1));
    const recurId = repeat > 1 ? uid() : null;
    const pad = n => String(n).padStart(2, '0');
    for (let i = 0; i < repeat; i++) {
      const d = new Date(data.date + 'T00:00:00'); d.setDate(d.getDate() + i * 7);
      const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      DB.scheduled.push({ id: uid(), ...data, date: ds, done: false, recurId });
    }
  }
  saveDB(); UI.closeModal(); UI.toast('Session scheduled.', 'good'); UI.refresh();
};
Business.toggleDone = function (id) { const s = DB.scheduled.find(x => x.id === id); s.done = !s.done; saveDB(); UI.refresh(); };
Business.scheduleRemove = function (id) {
  const s = DB.scheduled.find(x => x.id === id);
  if (s && s.recurId && DB.scheduled.filter(x => x.recurId === s.recurId).length > 1) {
    UI.confirm('Delete just this session, or the whole repeating series?', () => {
      DB.scheduled = DB.scheduled.filter(x => x.recurId !== s.recurId); saveDB(); UI.refresh();
    }, { danger: true, yes: 'Delete series' });
    // Provide a "just this one" path via a second toast action is overkill; default button = series, ESC/Cancel = none.
    return;
  }
  DB.scheduled = DB.scheduled.filter(x => x.id !== id); saveDB(); UI.refresh();
};

// -- Invoice / receipt PDF -------------------------------------------------
Business.invoice = function (clientId, pkgId) {
  const c = getClient(clientId);
  const p = (c.packages || []).find(x => x.id === pkgId);
  if (!p) return;
  const biz = (DB.settings || {}).businessName || "KovaaK's Coach";
  const E = UI.escape;
  const css = `body{font-family:'Segoe UI',system-ui,sans-serif;color:#1a1f29;font-size:11pt;margin:0}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #e8833a;padding-bottom:10pt}
    h1{font-size:22pt;margin:0;color:#b85a18} .meta{color:#6b7280;font-size:10pt}
    table{width:100%;border-collapse:collapse;margin:18pt 0} th{text-align:left;background:#faf3ec;border-bottom:1.5px solid #e6c4a3;padding:6pt 8pt;font-size:9pt;text-transform:uppercase;color:#8a5a2b}
    td{padding:8pt;border-bottom:1px solid #eee} .right{text-align:right} .tot{font-size:14pt;font-weight:800}
    .status{display:inline-block;padding:3pt 12pt;border-radius:20pt;font-weight:700;font-size:10pt}
    .paid{background:#eafaf0;color:#1e8a4c;border:1px solid #bce8cf} .unpaid{background:#fdecea;color:#c0392b;border:1px solid #f3c2bd}
    .foot{margin-top:26pt;color:#9aa1ab;font-size:8.5pt;text-align:center;border-top:1px solid #ddd;padding-top:8pt}`;
  const body = `<div class="hd"><div><h1>${E(biz)}</h1><div class="meta">Coaching invoice</div></div>
      <div class="meta" style="text-align:right">${p.paid ? '<span class="status paid">PAID</span>' : '<span class="status unpaid">UNPAID</span>'}<br>${UI.fmtDate(p.date || UI.today())}</div></div>
    <div style="margin-top:14pt"><b>Billed to:</b> ${E(c.name)}${c.discord ? ' &lt;' + E(c.discord) + '&gt;' : ''}</div>
    <table><thead><tr><th>Description</th><th class="right">Sessions</th><th class="right">Amount</th></tr></thead>
      <tbody><tr><td>${E(p.name || 'Coaching package')}</td><td class="right">${p.total || 0}</td><td class="right">${Business.money(p.price)}</td></tr></tbody>
      <tfoot><tr><td></td><td class="right tot">Total</td><td class="right tot">${Business.money(p.price)}</td></tr></tfoot></table>
    <div class="foot">Generated by KovaaK's Coach - ${UI.fmtDate(UI.today())}</div>`;
  const html = `<!DOCTYPE html><html lang="en-US"><head><meta charset="utf-8"><meta http-equiv="Content-Language" content="en-US"><style>${css}</style></head><body>${body}</body></html>`;
  const fname = `Invoice - ${c.name} - ${p.name || 'Package'}`.replace(/[^\w\- ]+/g, '').slice(0, 60) + '.pdf';
  UI.toast('Rendering invoice...');
  window.api.exportPdf(fname, html).then(r => UI.toast(r.success ? 'Invoice saved.' : r.msg, r.success ? 'good' : 'bad'));
};

/* -- Packages --------------------------------------------------------------- */
Business.pkgEdit = function (id) {
  const c = activeClient(); if (!c) return;
  const p = id ? (c.packages || []).find(x => x.id === id) : null;
  const f = (k, d = '') => UI.escape(p ? (p[k] ?? d) : d);
  UI.modal(`
    <div class="modal-head"><h2>${p ? 'Edit' : 'Add'} Package</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>Name</span><input id="pk-name" value="${f('name', '')}" placeholder="e.g. 5-Session Block"></label>
    <div class="row">
      <label class="field"><span>Total sessions</span><input id="pk-total" type="number" value="${f('total', '5')}"></label>
      <label class="field"><span>Used</span><input id="pk-used" type="number" value="${f('used', '0')}"></label>
      <label class="field"><span>Price ($)</span><input id="pk-price" type="number" value="${f('price', '')}" placeholder="0"></label>
    </div>
    <label class="field" style="display:flex;align-items:center;gap:.5rem;flex-direction:row"><input id="pk-paid" type="checkbox" ${p && p.paid ? 'checked' : ''} style="width:auto"> <span style="margin:0;text-transform:none;letter-spacing:0">Paid</span></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Business.pkgSave('${id || ''}')">${p ? 'Save' : 'Add'}</button></div>`);
};
Business.pkgSave = function (id) {
  const c = activeClient(); c.packages ||= [];
  const data = { name: document.getElementById('pk-name').value.trim() || 'Package', total: parseInt(document.getElementById('pk-total').value) || 0, used: parseInt(document.getElementById('pk-used').value) || 0, price: parseFloat(document.getElementById('pk-price').value) || 0, paid: document.getElementById('pk-paid').checked };
  if (id) Object.assign(c.packages.find(x => x.id === id), data);
  else c.packages.push({ id: uid(), ...data, date: UI.today() });
  saveDB(); UI.closeModal(); UI.toast('Package saved.', 'good'); UI.refresh();
};
Business.pkgRemove = function (id) { const c = activeClient(); c.packages = (c.packages || []).filter(x => x.id !== id); saveDB(); UI.refresh(); };
Business.togglePaid = function (id) { const c = activeClient(); const p = (c.packages || []).find(x => x.id === id); p.paid = !p.paid; saveDB(); UI.refresh(); };
Business.useDelta = function (id, d) { const c = activeClient(); const p = (c.packages || []).find(x => x.id === id); p.used = Math.max(0, (p.used || 0) + d); saveDB(); UI.refresh(); };

Business.templateEdit = function (id) {
  const template = id ? (DB.packageTemplates || []).find(x => x.id === id) : null;
  const f = (key, fallback = '') => UI.escape(template ? (template[key] ?? fallback) : fallback);
  UI.modal(`
    <div class="modal-head"><h2>${template ? 'Edit' : 'New'} Package Template</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>Template name</span><input id="pt-name" value="${f('name')}" placeholder="e.g. Monthly Coaching"></label>
    <div class="row">
      <label class="field"><span>Total sessions</span><input id="pt-total" type="number" min="1" value="${f('total', 4)}"></label>
      <label class="field"><span>Price ($)</span><input id="pt-price" type="number" min="0" step="0.01" value="${f('price')}" placeholder="0"></label>
    </div>
    <label class="field"><span>Description</span><input id="pt-description" value="${f('description')}" placeholder="Weekly session plus async review"></label>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Business.templateSave('${id || ''}')">Save Template</button></div>`);
};
Business.templateSave = function (id) {
  const name = document.getElementById('pt-name').value.trim();
  const total = Math.max(0, parseInt(document.getElementById('pt-total').value) || 0);
  const price = Math.max(0, parseFloat(document.getElementById('pt-price').value) || 0);
  const description = document.getElementById('pt-description').value.trim();
  if (!name) { UI.toast('Template name is required.', 'bad'); return; }
  if (!total) { UI.toast('A package template needs at least one session.', 'bad'); return; }
  DB.packageTemplates ||= [];
  const data = { name, total, price, description, updatedAt: new Date().toISOString() };
  if (id) {
    const template = DB.packageTemplates.find(x => x.id === id);
    if (template) Object.assign(template, data);
  } else {
    DB.packageTemplates.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
  }
  saveDB(); UI.closeModal(); UI.toast('Package template saved.', 'good'); UI.refresh();
};
Business.templateApply = function (id) {
  const client = activeClient();
  const template = (DB.packageTemplates || []).find(x => x.id === id);
  if (!client || !template) return;
  client.packages ||= [];
  client.packages.push({
    id: uid(), templateId: template.id, name: template.name,
    total: Math.max(0, +template.total || 0), used: 0,
    price: Math.max(0, +template.price || 0), paid: false, date: UI.today(),
  });
  saveDB();
  UI.toast(`${template.name} applied to ${client.name}.`, 'good');
  UI.refresh();
};
Business.templateRemove = function (id) {
  const template = (DB.packageTemplates || []).find(x => x.id === id);
  if (!template) return;
  UI.confirm(`Delete the "${template.name}" template? Existing client packages will not be changed.`, () => {
    DB.packageTemplates = DB.packageTemplates.filter(x => x.id !== id);
    saveDB(); UI.toast('Package template deleted.'); UI.refresh();
  });
};


