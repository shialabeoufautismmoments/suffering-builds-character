/* =============================================================================
   CAL -Cal.com integration: configurable booking link, inline embed, per-client
   booking links, and one-way sync of confirmed bookings into the Business
   scheduler (via the API v2, fetched in the main process to avoid CORS).
   ============================================================================= */
const Cal = {};

Cal.cfg = () => DB.settings || {};
Cal.origin = () => (Cal.cfg().calOrigin || 'https://cal.com').replace(/\/+$/, '');

// Normalise a booking link to its slug (the part after the host). Accepts a full
// URL, "cal.com/slug", or a bare "slug" / "slug/event".
Cal.slug = function (link) {
  if (!link) return '';
  let s = String(link).trim().replace(/^https?:\/\//i, '');
  // Strip a leading host only if the first segment looks like a domain (has a dot).
  s = s.replace(/^[^/]*\.[^/]*\//, '');
  return s.replace(/^\/+/, '').replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/+$/, '');
};
Cal.linkFor = function (client) {
  return Cal.slug((client && client.calLink) || Cal.cfg().calLink || '');
};
Cal.urlFor = function (client) {
  const slug = Cal.linkFor(client);
  return slug ? Cal.origin() + '/' + slug : '';
};
Cal.configured = function () { return !!Cal.slug(Cal.cfg().calLink); };
Cal.hasKey = function () { return !!(Cal.cfg().calApiKey || '').trim(); };

/* -- Settings persistence --------------------------------------------------- */
Cal.saveLink = function (v) { DB.settings ||= {}; DB.settings.calLink = (v || '').trim(); saveDB(); };
Cal.saveKey = function (v) { DB.settings ||= {}; DB.settings.calApiKey = (v || '').trim(); saveDB(); };

/* -- Links ------------------------------------------------------------------ */
Cal._url = function (clientId) {
  const c = clientId ? getClient(clientId) : null;
  const url = Cal.urlFor(c);
  if (!url) { UI.toast('Set your Cal.com booking link in Settings (Settings first.', 'bad'); return ''; }
  return url;
};
Cal.copyLink = function (clientId) {
  const url = Cal._url(clientId); if (!url) return;
  navigator.clipboard.writeText(url).then(
    () => UI.toast('Booking link copied: ' + url, 'good'),
    () => UI.toast('Clipboard blocked -try again.', 'bad'));
};
Cal.openExternal = function (clientId) {
  const url = Cal._url(clientId); if (!url) return;
  window.api.openExternal(url).then(r => { if (!r.success) UI.toast('Could not open link: ' + (r.msg || ''), 'bad'); });
};

/* -- Inline embed (Cal.com embed.js) ---------------------------------------- */
Cal.embedModal = function (clientId) {
  const c = clientId ? getClient(clientId) : null;
  const slug = Cal.linkFor(c);
  if (!slug) { UI.toast('Set your Cal.com booking link in Settings (Settings first.', 'bad'); return; }
  UI.modal(`
    <div class="modal-head"><h2>Book a session${c ? ' -' + UI.escape(c.name) : ''}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="flex gap-sm mb">
      <button class="btn btn-sm" onclick="Cal.copyLink('${clientId || ''}')">Copy link</button>
      <button class="btn btn-sm" onclick="Cal.openExternal('${clientId || ''}')">->Open in browser</button>
      <span class="muted" style="font-size:.76rem;align-self:center">${UI.escape(Cal.urlFor(c))}</span>
    </div>
    <div id="cal-embed" style="min-height:62vh;border:1px solid var(--border);border-radius:8px;overflow:auto;background:#fff"></div>`, { wide: true });
  Cal.mountEmbed('cal-embed', slug);
};

Cal.mountEmbed = function (elId, slug) {
  const origin = Cal.origin();
  const run = () => {
    try {
      window.Cal('init', { origin });
      window.Cal('inline', { elementOrSelector: '#' + elId, calLink: slug, layout: 'month_view' });
    } catch (e) {
      const el = document.getElementById(elId);
      if (el) el.innerHTML = `<p style="padding:1rem;color:#444">Couldn't load the inline booking page -use "Open in browser" above. (${UI.escape(e.message)})</p>`;
    }
  };
  if (window.Cal) return run();
  // Official Cal.com embed loader (queues calls until embed.js loads).
  (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if (typeof namespace === 'string') { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ['initNamespace', namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, 'https://app.cal.com/embed/embed.js', 'init');
  run();
};

/* -- Sync confirmed bookings into the Business scheduler -------------------- */
Cal.sync = function (silent) {
  const key = (Cal.cfg().calApiKey || '').trim();
  if (!key) { if (!silent) UI.toast('Add your Cal.com API key in Settings (Settings to sync bookings.', 'bad'); return Promise.resolve(); }
  if (!silent) UI.toast('Syncing bookings from Cal.com...');
  return window.api.calBookings(key, Cal.cfg().calApiVersion).then(r => {
    if (!r || !r.success) { if (!silent) UI.toast('Cal.com sync failed: ' + ((r && r.msg) || 'unknown error'), 'bad'); return; }
    const list = r.bookings || [];
    const added = Cal.ingest(list);
    saveDB();
    if (!silent) UI.toast(`Synced ${list.length} booking${list.length !== 1 ? 's' : ''} -${added} new.`, 'good');
    if (UI.currentView === 'business') UI.refresh();
  }).catch(e => { if (!silent) UI.toast('Cal.com sync error: ' + e.message, 'bad'); });
};

Cal.ingest = function (bookings) {
  DB.scheduled ||= [];
  let added = 0;
  (bookings || []).forEach(b => {
    if (!b || !b.start) return;
    if (b.status && (b.status === 'cancelled' || b.status === 'rejected')) return;
    const start = new Date(b.start);
    if (isNaN(start)) return;
    const att = (b.attendees && b.attendees[0]) || {};
    const rec = {
      date: Cal._date(start), time: Cal._time(start),
      notes: b.title || ('Booking with ' + (att.name || 'client')),
      clientId: Cal.matchClient(att), calUid: b.uid || '', source: 'cal', done: false,
    };
    const existing = b.uid && DB.scheduled.find(s => s.calUid && s.calUid === b.uid);
    if (existing) Object.assign(existing, rec, { id: existing.id, done: existing.done });
    else { DB.scheduled.push({ id: uid(), ...rec }); added++; }
  });
  return added;
};

Cal.matchClient = function (att) {
  if (!att) return '';
  const name = (att.name || '').trim().toLowerCase();
  const email = (att.email || '').trim().toLowerCase();
  const c = (name && DB.clients.find(x => (x.name || '').trim().toLowerCase() === name))
    || (email && DB.clients.find(x => (x.discord || '').trim().toLowerCase() === email));
  return c ? c.id : '';
};

Cal._date = function (d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
Cal._time = function (d) { const p = n => String(n).padStart(2, '0'); return `${p(d.getHours())}:${p(d.getMinutes())}`; };

/* -- Card shown on the Business tab ----------------------------------------- */
Cal.businessCard = function (client) {
  if (!Cal.configured()) {
    return `<div class="card mb"><div class="card-head"><h2>Online booking (Cal.com)</h2></div>
      <p class="muted" style="font-size:.84rem">Let clients self-book sessions with Cal.com. Add your booking link in Settings to enable the embedded booking page, shareable links, and (optionally) syncing bookings into your schedule.</p>
      <button class="btn btn-primary btn-sm mt-sm" onclick="Data.settings()">Set up in Settings</button></div>`;
  }
  const cid = client ? client.id : '';
  return `<div class="card mb">
    <div class="card-head"><h2>Online booking (Cal.com)</h2><span class="muted" style="font-size:.78rem">${UI.escape(Cal.urlFor(client))}</span></div>
    <div class="flex gap-sm wrap center">
      <button class="btn btn-sm btn-primary" onclick="Cal.embedModal('${cid}')">📅 Open booking page${client ? ' for ' + UI.escape(client.name) : ''}</button>
      <button class="btn btn-sm" onclick="Cal.copyLink('${cid}')">Copy link</button>
      <button class="btn btn-sm" onclick="Cal.openExternal('${cid}')">->Open in browser</button>
      ${Cal.hasKey() ? `<button class="btn btn-sm btn-gold" onclick="Cal.sync()">🔄 Sync bookings</button>` : `<span class="muted" style="font-size:.74rem;align-self:center">Add an API key in Settings to sync bookings into your schedule.</span>`}
    </div></div>`;
};


