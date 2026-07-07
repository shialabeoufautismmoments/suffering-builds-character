/* =============================================================================
   DATA -backup / restore of the entire database.
   ============================================================================= */
const Data = {};

const ACCENTS = {
  KovaaK: { a: '#e8833a', soft: 'rgba(232,131,58,0.15)', hover: '#f7975a' },
  Amber: { a: '#e8833a', soft: 'rgba(232,131,58,0.15)', hover: '#f7975a' },
  Blue: { a: '#5aa9e6', soft: 'rgba(90,169,230,0.15)', hover: '#7bbcef' },
  Green: { a: '#3fb950', soft: 'rgba(63,185,80,0.15)', hover: '#56c463' },
  Purple: { a: '#c678dd', soft: 'rgba(198,120,221,0.15)', hover: '#d391e8' },
  Pink: { a: '#ff6b81', soft: 'rgba(255,107,129,0.15)', hover: '#ff8a9b' },
  Cyan: { a: '#2bd4c4', soft: 'rgba(43,212,196,0.15)', hover: '#52ddd0' },
};
Data.ACCENTS = ACCENTS;
Data.applyAccent = function (name) {
  const p = ACCENTS[name] || ACCENTS.KovaaK;
  const r = document.documentElement.style;
  r.setProperty('--accent', p.a); r.setProperty('--accent-soft', p.soft); r.setProperty('--accent-hover', p.hover);
};
Data.setAccent = function (name) {
  DB.settings ||= {}; DB.settings.accent = name; delete DB.settings.accentHex; saveDB();
  Data.applyAccent(name);
  Data.settings(); // re-render the modal to update the selected swatch
};

/* -- Colour helpers + custom accent / theme pickers ------------------------- */
Data.hexToRgba = function (hex, a) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
Data.lighten = function (hex, amt) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  const cl = v => Math.max(0, Math.min(255, v)), add = Math.round(255 * amt / 100);
  const r = cl(((n >> 16) & 255) + add), g = cl(((n >> 8) & 255) + add), b = cl((n & 255) + add);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

// Current accent hex (custom override -> preset -> KovaaK default).
Data.accentHexNow = function () {
  const s = DB.settings || {};
  if (s.accentHex) return s.accentHex;
  if (s.accent && ACCENTS[s.accent]) return ACCENTS[s.accent].a;
  return ACCENTS.KovaaK.a;
};
Data.applyAccentHex = function (hex) {
  const r = document.documentElement.style;
  r.setProperty('--accent', hex);
  r.setProperty('--accent-soft', Data.hexToRgba(hex, 0.15));
  r.setProperty('--accent-hover', Data.lighten(hex, 14));
};
Data.setAccentHex = function (hex) {
  DB.settings ||= {}; DB.settings.accentHex = hex; delete DB.settings.accent; saveDB();
  Data.applyAccentHex(hex);
  Data.settings();
};

const THEME_VARS = [['--bg', 0], ['--bg-2', 5], ['--card', 9], ['--card-2', 14], ['--border', 22], ['--border-soft', 17]];
Data.applyTheme = function (hex) {
  const r = document.documentElement.style;
  THEME_VARS.forEach(([v, amt]) => r.setProperty(v, amt ? Data.lighten(hex, amt) : hex));
};
Data.setThemeHex = function (hex) {
  DB.settings ||= {}; DB.settings.themeBg = hex; saveDB();
  Data.applyTheme(hex);
};
Data.resetTheme = function () {
  DB.settings ||= {}; delete DB.settings.themeBg; saveDB();
  THEME_VARS.forEach(([v]) => document.documentElement.style.removeProperty(v));
  Data.settings();
};

// Apply all persisted appearance settings (called on boot + after restore).
Data.applyAll = function () {
  const s = DB.settings || {};
  if (s.themeBg) Data.applyTheme(s.themeBg);
  if (s.accentHex) Data.applyAccentHex(s.accentHex);
  else if (s.accent) Data.applyAccent(s.accent);
  if (typeof Brand !== 'undefined') Brand.apply();
};
Data.saveBusiness = function (val) { DB.settings ||= {}; DB.settings.businessName = val.trim(); saveDB(); if (typeof Brand !== 'undefined') Brand.apply(); };

Data.checkUpdate = async function () {
  const url = (DB.settings || {}).updateUrl;
  if (!url) { UI.toast('No update feed configured. Updates currently come from reinstalling a new build.', 'bad'); return; }
  UI.toast('Checking...');
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    const latest = data.version || data.tag_name || '';
    const cur = Data._version || '';
    if (latest && latest.replace(/^v/, '') !== cur.replace(/^v/, '')) UI.toast(`Update available: ${latest} (you have ${cur}).`, 'good');
    else UI.toast(`You're on the latest version (${cur}).`, 'good');
  } catch (e) { UI.toast('Update check failed: ' + e.message, 'bad'); }
};

Data.settings = function () {
  const s = DB.settings || {};
  const cur = s.accent && ACCENTS[s.accent] ? s.accent : 'KovaaK';
  const counts = `${DB.clients.length} clients - ${DB.matches.length} matches - ${DB.vods.length} VODs - ${DB.sessions.length} sessions - ${DB.playlists.length} playlists`;
  UI.modal(`
    <div class="modal-head"><h2>Settings</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>

    <h3 style="font-size:.92rem">Appearance</h3>
    <p class="muted" style="font-size:.8rem;margin:.3rem 0 .5rem">Accent colour</p>
    <div class="flex gap-sm wrap center mb">
      ${Object.entries(ACCENTS).map(([name, p]) => `<button title="${name}" onclick="Data.setAccent('${name}')" style="width:28px;height:28px;border-radius:50%;background:${p.a};border:2px solid ${!s.accentHex && cur === name ? '#fff' : 'transparent'};cursor:pointer"></button>`).join('')}
      <label class="flex center" title="Custom accent colour" style="gap:.3rem;font-size:.78rem;color:var(--text-muted);margin-left:.3rem">
        🎨 <input type="color" value="${Data.accentHexNow()}" onchange="Data.setAccentHex(this.value)" style="width:30px;height:28px;padding:0;border:1px solid var(--border);border-radius:6px;background:none;cursor:pointer"></label>
    </div>
    <p class="muted" style="font-size:.8rem;margin:.3rem 0 .5rem">Theme / background colour</p>
    <div class="flex gap-sm wrap center mb">
      <label class="flex center" style="gap:.3rem;font-size:.78rem;color:var(--text-muted)">
        🖌 <input type="color" value="${(s.themeBg || '#0d1117')}" onchange="Data.setThemeHex(this.value)" style="width:30px;height:28px;padding:0;border:1px solid var(--border);border-radius:6px;background:none;cursor:pointer"></label>
      <button class="btn btn-xs btn-ghost" onclick="Data.resetTheme()">Reset to default</button>
    </div>

    <div class="divider"></div>
    <h3 style="font-size:.92rem">Coach / Business</h3>
    ${typeof Brand !== 'undefined' ? Brand.summaryHtml() : `<label class="field"><span>Business name</span><input value="${UI.escape(s.businessName || '')}" onchange="Data.saveBusiness(this.value)"></label>`}

    <div class="divider"></div>
    <h3 style="font-size:.92rem">Online booking (Cal.com)</h3>
    <label class="field"><span>Cal.com booking link</span><input value="${UI.escape(s.calLink || '')}" placeholder="e.g. your-name or your-name/kovaaks-coaching" onchange="Cal.saveLink(this.value)"></label>
    <label class="field"><span>Cal.com API key (optional -enables syncing bookings into your schedule)</span><input type="password" value="${UI.escape(s.calApiKey || '')}" placeholder="cal_live_..." onchange="Cal.saveKey(this.value)"></label>
    <p class="muted" style="font-size:.76rem;margin-top:-.2rem">Booking link = the slug from your cal.com page URL. API key = cal.com -> Settings -> Developer -> API keys. These settings are shared with the password-protected coach workspace so every coach can use the same booking integration.</p>

    <div class="divider"></div>
    <h3 style="font-size:.92rem">Backup &amp; restore</h3>
    <p class="muted" style="font-size:.8rem;margin:.35rem 0 .6rem">${counts}. Export everything to a single <code>.kcoach</code> file (auto-backup also runs each launch, last 10 kept).</p>
    <div class="flex gap-sm wrap">
      <button class="btn btn-primary" onclick="Data.exportBackup()">Export all data...</button>
      <button class="btn" onclick="Data.importBackup()">Restore from backup...</button>
    </div>

    <div class="divider"></div>
    <h3 style="font-size:.92rem">Cloud backup &amp; multi-device sync</h3>
    <p class="muted" style="font-size:.78rem;margin:.35rem 0 .6rem">All coaches share one password-protected workspace through sufferingbuildscharacter.com. Changes save locally first, upload automatically, and are checked for team updates every 30 seconds.</p>
    <div id="cloud-sync-settings">${typeof Sync !== 'undefined' ? Sync.settingsHtml({ state: 'unconfigured' }) : '<span class="muted">Loading sync status...</span>'}</div>

    <div class="divider"></div>
    <div class="flex between center">
      <span class="muted" style="font-size:.8rem">CoachSBC HQ <b id="kc-version">v${Data._version || '...'}</b></span>
      <button class="btn btn-sm btn-ghost" onclick="Data.checkUpdate()">Check for updates</button>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Close</button></div>`);
  if (!Data._version && window.api.appVersion) window.api.appVersion().then(v => { Data._version = v; const el = document.getElementById('kc-version'); if (el) el.textContent = 'v' + v; });
  if (typeof Sync !== 'undefined') Sync.renderSettingsStatus();
};

Data.exportBackup = function () {
  const payload = { app: 'kovaaks-coach', version: 1, exportedAt: new Date().toISOString(), data: DB };
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  window.api.exportBackup(`kovaaks-coach-backup-${stamp}.kcoach`, JSON.stringify(payload, null, 2))
    .then(r => UI.toast(r.success ? 'Backup saved: ' + r.msg.split(/[\\/]/).pop() : r.msg, r.success ? 'good' : 'bad'));
};

Data.importBackup = async function () {
  const file = await window.api.importBackup();
  if (!file) return;
  if (file.error) { UI.toast('Read error: ' + file.error, 'bad'); return; }
  let parsed;
  try { parsed = JSON.parse(file.content); } catch (e) { UI.toast('That file is not a valid backup.', 'bad'); return; }

  const data = Data.backupData(parsed);
  if (!data) { UI.toast('Backup is missing client data.', 'bad'); return; }

  const summary = `${(data.clients || []).length} clients, ${(data.matches || []).length} matches, ${(data.vods || []).length} VODs, ${(data.sessions || []).length} sessions`;
  UI.confirm(`Restore will REPLACE all current data with this backup (${summary}). Your current data will be lost. Continue?`, () => {
    Data.replaceDatabase(data);
    UI.toast('Backup restored.', 'good');
  });
};

Data.backupData = function (parsed) {
  return parsed && parsed.data && Array.isArray(parsed.data.clients) ? parsed.data
    : (parsed && Array.isArray(parsed.clients) ? parsed : null);
};
Data.replaceDatabaseString = function (raw) {
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { UI.toast('The synced copy is not valid coaching data.', 'bad'); return false; }
  const data = Data.backupData(parsed);
  if (!data) { UI.toast('The synced copy is missing client data.', 'bad'); return false; }
  Data.replaceDatabase(data);
  return true;
};
Data.replaceDatabase = function (data) {
  const defaults = {
    clients: [], scenarios: {}, playlists: [], vods: [], matches: [], sessions: [],
    playbook: {}, leads: [], benchmarks: [], scheduled: [], reminders: [], packageTemplates: [], coaches: [], cloud: { revision: 0, updatedAt: null }, settings: {},
    activeClientId: null,
  };
  Object.keys(DB).forEach(k => { delete DB[k]; });
  Object.assign(DB, defaults, data);
  DB.packageTemplates ||= [];
  DB.clients.forEach(c => {
    c.goals ||= []; c.developmentPlans ||= []; c.packages ||= [];
    if (!c.trackerStats && c.valorant && c.valorant.stats) {
      const s = c.valorant.stats;
      c.trackerStats = {
        rank: c.rank || '', matches: s.games ?? null, winRate: s.winRate ?? null,
        headshotPct: s.headshotPct ?? null, kd: s.kd ?? null, adr: s.adr ?? null,
        acs: s.acs ?? null, notes: 'Migrated from legacy match integration',
        source: 'legacy', updatedAt: c.valorant.syncedAt || new Date().toISOString(),
      };
    }
    delete c.valorant;
    delete c.riotShard;
    c.trackerHistory ||= [];
    if (c.trackerStats && c.trackerStats.updatedAt && !c.trackerHistory.some(x => x.updatedAt === c.trackerStats.updatedAt)) {
      c.trackerHistory.push({ id: c.trackerStats.id || uid(), ...c.trackerStats });
    }
    c.monthlyReports ||= {};
  });
  DB.vods.forEach(v => { v.notes ||= []; v.reviewStatus ||= v.notes.length ? 'complete' : 'inbox'; });
  DB.sessions.forEach(s => {
    s.prepMinutes ||= 0;
    s.homework ||= [];
    s.homework.forEach(h => { h.dueDate ||= ''; });
  });
  saveDB();
  Data.applyAll();
  UI.closeModal();
  UI.updateClientPill();
  App.nav('dashboard');
};



