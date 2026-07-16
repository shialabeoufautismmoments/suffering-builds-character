/* =============================================================================
   UI -navigation, modals, toasts, shared helpers
   ============================================================================= */
const UI = {};
UI.LOCALE = 'en-US';

UI.escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// For safely embedding a string inside a single-quoted inline JS handler.
UI.attr = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

UI.initials = (name) => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
UI.safeAvatar = value => /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(String(value || '')) ? String(value) : '';

// seconds -> "h:mm:ss" or "m:ss"
UI.fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

// "m:ss" or "h:mm:ss" -> seconds
UI.parseTime = (str) => {
  const parts = String(str).trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};

// seconds -> Twitch/YouTube deep-link time format "1h2m3s"
UI.hms = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h ? h + 'h' : ''}${m ? m + 'm' : ''}${s}s`;
};

UI.fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(UI.LOCALE, { year: 'numeric', month: 'short', day: 'numeric' });
};
UI.fmtDateLong = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return String(date || '');
  return d.toLocaleDateString(UI.LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
};
UI.fmtMonthYear = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return String(date || '');
  return d.toLocaleDateString(UI.LOCALE, { month: 'long', year: 'numeric' });
};
UI.fmtDateTime = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return String(date || '');
  return d.toLocaleString(UI.LOCALE, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
UI.fmtNumber = (n, opts) => Number(n || 0).toLocaleString(UI.LOCALE, opts);

UI.today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* -- Toasts ----------------------------------------------------------------- */
UI.toast = (msg, type = '') => {
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '0.3s'; }, 2600);
  setTimeout(() => el.remove(), 2950);
};

/* -- Modal ------------------------------------------------------------------ */
UI.modal = (html, { wide = false } = {}) => {
  const bg = document.getElementById('modal-bg');
  const m = document.getElementById('modal');
  m.className = 'modal' + (wide ? ' wide' : '');
  m.innerHTML = html;
  bg.classList.add('show');
  const focusable = m.querySelector('input, textarea, select');
  if (focusable) setTimeout(() => focusable.focus(), 50);
};
UI.closeModal = () => document.getElementById('modal-bg').classList.remove('show');

// Modals close only via the x/ Cancel buttons or Escape -NOT by clicking the
// backdrop, so a stray click never discards a half-filled form.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) UI.closeModal();
});

/* -- Confirm dialog --------------------------------------------------------- */
UI.confirm = (message, onYes, { danger = true, yes = 'Confirm' } = {}) => {
  UI.modal(`
    <div class="modal-head"><h2>Confirm</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <p class="muted">${UI.escape(message)}</p>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-yes">${UI.escape(yes)}</button>
    </div>`);
  document.getElementById('confirm-yes').onclick = () => { UI.closeModal(); onYes(); };
};

/* -- Navigation ------------------------------------------------------------- */
UI.renderers = {}; // view -> render fn, registered by feature modules
UI.NAV_GROUPS = {
  clients: ['dashboard', 'clients', 'coaches', 'matches', 'vods', 'plans', 'playlists', 'mechanics'],
  activity: ['waitlist', 'today', 'telemetry', 'sessions'],
  business: ['business', 'coachanalytics', 'reports'],
};

UI.nav = (view) => {
  document.querySelectorAll('[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  document.querySelectorAll('.nav-group').forEach(group => {
    const views = UI.NAV_GROUPS[group.dataset.navGroup] || [];
    group.classList.toggle('active', views.includes(view));
    group.open = false;
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) {
    el.classList.add('active');
    if (UI.renderers[view]) UI.renderers[view](el);
  }
  UI.currentView = view;
};

// Re-render the current view (after a data change).
UI.refresh = () => { if (UI.currentView) UI.nav(UI.currentView); };

UI.updateClientPill = () => {
  const c = activeClient();
  const ava = document.getElementById('pill-ava');
  const name = document.getElementById('pill-name');
  if (ava) {
    ava.replaceChildren();
    const src = c && UI.safeAvatar(c.avatar);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      ava.appendChild(img);
    } else {
      ava.textContent = c ? UI.initials(c.name) : '-';
    }
  }
  if (name) name.textContent = c ? c.name : 'No client';

  const select = document.getElementById('nav-client-select');
  if (select) {
    select.replaceChildren();
    if (!DB.clients.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No clients';
      select.appendChild(option);
      select.disabled = true;
    } else {
      DB.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        select.appendChild(option);
      });
      select.disabled = false;
      select.value = DB.activeClientId || DB.clients[0].id;
    }
  }
};

document.querySelectorAll('.nav-group').forEach(group => {
  group.addEventListener('toggle', () => {
    if (!group.open) return;
    document.querySelectorAll('.nav-group').forEach(other => { if (other !== group) other.open = false; });
  });
});

UI.emptyState = (icon, title, sub) => `
  <div class="empty-state">
    <div class="big">${icon}</div>
    <div style="font-size:1rem;color:var(--text-muted)">${UI.escape(title)}</div>
    ${sub ? `<div style="margin-top:.4rem">${UI.escape(sub)}</div>` : ''}
  </div>`;

// Scrollable checkbox list for bulk-apply actions (playlists, homework).
// By default excludes the active client (for "also assign this to...").
// Pass { includeActive: true, preCheckActive: true } for a standalone
// "pick anyone on the roster" picker that pre-checks the current client.
// Read the picks back with UI.checkedClientIds() after the coach confirms.
UI.clientChecklistHtml = function ({ includeActive = false, preCheckActive = false } = {}) {
  const activeId = DB.activeClientId;
  const pool = includeActive ? DB.clients : DB.clients.filter(c => c.id !== activeId);
  const rows = pool.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!rows.length) return '<p class="muted" style="font-size:.82rem">No other clients yet.</p>';
  return `<div class="client-checklist" style="max-height:220px;overflow-y:auto;border:1px solid var(--border-soft);border-radius:8px;padding:.5rem">
    ${rows.map(c => `<label class="flex center gap-sm" style="cursor:pointer;padding:.25rem 0">
      <input type="checkbox" class="bulk-client-check" value="${c.id}" style="width:auto" ${preCheckActive && c.id === activeId ? 'checked' : ''}>
      <span>${UI.escape(c.name)}${c.game ? ` <span class="muted" style="font-size:.74rem">- ${UI.escape(c.game)}</span>` : ''}</span>
    </label>`).join('')}
  </div>`;
};
UI.checkedClientIds = () => [...document.querySelectorAll('.bulk-client-check:checked')].map(el => el.value);

// Guard a view that requires an active client.
UI.requireClient = (el, viewName) => {
  if (activeClient()) return false;
  el.innerHTML = `
    <div class="page-head"><div><h1>${UI.escape(viewName)}</h1></div></div>
    ${UI.emptyState('👤', 'No active client selected', 'Pick or create a client on the Clients tab first.')}
    <div style="text-align:center"><button class="btn btn-primary" onclick="App.nav('clients')">Go to Clients</button></div>`;
  return true;
};


