/* =============================================================================
   SYNC -automatic shared workspace sync through sufferingbuildscharacter.com
   ============================================================================= */
const Sync = {
  dirty: false,
  syncing: false,
  _saveTimer: null,
  _pollTimer: null,
  lastError: '',
};

Sync.settingsHtml = function () {
  const revision = Number(DB.cloud && DB.cloud.revision || 0);
  return `<div class="sync-panel ${Sync.lastError ? 'bad' : 'good'}">
    <div class="flex between center gap wrap">
      <div><b>${Sync.lastError ? 'Sync needs attention' : 'Shared workspace connected'}</b>
        <div class="muted">${Sync.lastError ? UI.escape(Sync.lastError) : `Automatic sync is on${revision ? ` -revision ${revision}` : ''}.`}</div>
      </div>
      <span class="pill ${Sync.lastError ? 'mistake' : 'good'}">${Sync.syncing ? 'SYNCING' : Sync.lastError ? 'OFFLINE' : 'LIVE'}</span>
    </div>
    <div class="flex gap-sm wrap mt-sm"><button class="btn btn-sm btn-primary" onclick="Sync.syncNow()">Sync now</button></div>
  </div>`;
};

Sync.renderSettingsStatus = function () {
  const box = document.getElementById('cloud-sync-settings');
  if (box) box.innerHTML = Sync.settingsHtml();
};

Sync.recordTime = item => new Date(item && (item.updatedAt || item.createdAt || item.date) || 0).getTime();

Sync.mergeArray = function (local = [], remote = []) {
  const map = new Map();
  [...remote, ...local].forEach(item => {
    if (!item || !item.id) return;
    const previous = map.get(item.id);
    if (!previous || Sync.recordTime(item) >= Sync.recordTime(previous)) map.set(item.id, item);
  });
  return [...map.values()];
};

Sync.merge = function (local, remote) {
  const merged = { ...remote, ...local };
  ['clients', 'playlists', 'vods', 'matches', 'sessions', 'leads', 'benchmarks', 'scheduled', 'reminders', 'packageTemplates', 'coaches']
    .forEach(key => { merged[key] = Sync.mergeArray(local[key], remote[key]); });
  merged.scenarios = { ...(remote.scenarios || {}), ...(local.scenarios || {}) };
  merged.playbook = { ...(remote.playbook || {}), ...(local.playbook || {}) };
  merged.settings = { ...(remote.settings || {}), ...(local.settings || {}) };
  merged.cloud = remote.cloud || { revision: 0, updatedAt: null };
  return merged;
};

Sync.apply = async function (data) {
  if (!data || !Array.isArray(data.clients)) return false;
  const defaults = {
    clients: [], scenarios: {}, playlists: [], vods: [], matches: [], sessions: [],
    playbook: {}, leads: [], benchmarks: [], scheduled: [], reminders: [],
    packageTemplates: [], coaches: [], settings: {}, cloud: { revision: 0, updatedAt: null },
    activeClientId: null,
  };
  Object.keys(DB).forEach(key => delete DB[key]);
  Object.assign(DB, defaults, data);
  DB.coaches ||= [];
  DB.cloud ||= { revision: 0, updatedAt: null };
  await window.api.saveStore(JSON.stringify(DB));
  if (typeof Access !== 'undefined') Access.updateNav();
  return true;
};

Sync.pull = async function ({ merge = false, quiet = false } = {}) {
  const result = await window.api.coachWorkspaceGet();
  if (!result.data) return false;
  const remoteRevision = Number(result.data.cloud && result.data.cloud.revision || 0);
  const localRevision = Number(DB.cloud && DB.cloud.revision || 0);
  if (remoteRevision <= localRevision) return false;
  await Sync.apply(merge ? Sync.merge(DB, result.data) : result.data);
  Sync.dirty = merge;
  if (!quiet) UI.toast('Loaded the latest team workspace.', 'good');
  return true;
};

Sync.push = async function ({ quiet = false } = {}) {
  if (Sync.syncing) return false;
  Sync.syncing = true;
  Sync.renderSettingsStatus();
  try {
    let result = await window.api.coachWorkspacePut({
      data: DB,
      baseRevision: Number(DB.cloud && DB.cloud.revision || 0),
    });
    if (result.conflict && result.data) {
      const merged = Sync.merge(DB, result.data);
      await Sync.apply(merged);
      result = await window.api.coachWorkspacePut({
        data: DB,
        baseRevision: Number(result.data.cloud && result.data.cloud.revision || 0),
      });
    }
    if (!result.data) throw new Error(result.error || 'Could not resolve the sync conflict.');
    await Sync.apply(result.data);
    Sync.dirty = false;
    Sync.lastError = '';
    if (!quiet) UI.toast('Shared workspace is up to date.', 'good');
    return true;
  } catch (e) {
    Sync.lastError = e.message || 'Sync is temporarily unavailable.';
    if (!quiet) UI.toast(`${Sync.lastError} Local data is safe.`, 'bad');
    return false;
  } finally {
    Sync.syncing = false;
    Sync.renderSettingsStatus();
  }
};

Sync.syncNow = async function () {
  try {
    const pulled = await Sync.pull({ merge: Sync.dirty, quiet: true });
    if (Sync.dirty || !pulled) await Sync.push();
    else {
      Sync.lastError = '';
      UI.refresh();
      UI.toast('Loaded the latest team workspace.', 'good');
    }
  } catch (e) {
    Sync.lastError = e.message;
    Sync.renderSettingsStatus();
    UI.toast(`${e.message} Local data is safe.`, 'bad');
  }
};

Sync.onLocalSave = function () {
  if (!Access.unlocked) return;
  Sync.dirty = true;
  clearTimeout(Sync._saveTimer);
  Sync._saveTimer = setTimeout(() => Sync.push({ quiet: true }), 1200);
};

Sync.bootstrap = async function () {
  try {
    const result = await window.api.coachWorkspaceGet();
    if (result.data) {
      const localHasData = DB.clients.length || DB.coaches.length || DB.playlists.length || DB.sessions.length;
      await Sync.apply(localHasData ? Sync.merge(DB, result.data) : result.data);
      Sync.dirty = !!localHasData;
      if (Sync.dirty) await Sync.push({ quiet: true });
    } else {
      Sync.dirty = true;
      await Sync.push({ quiet: true });
    }
    Sync.lastError = '';
  } catch (e) {
    Sync.lastError = e.message || 'Cloud sync is unavailable.';
  }
  clearInterval(Sync._pollTimer);
  Sync._pollTimer = setInterval(async () => {
    if (Sync.dirty || Sync.syncing) return;
    try {
      if (await Sync.pull({ quiet: true })) UI.refresh();
    } catch (e) { Sync.lastError = e.message; }
  }, 30000);
};

Sync.startup = () => {};
