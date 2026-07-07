/* =============================================================================
   OVERWATCH PROFILE SNAPSHOTS - compliant profile linking and coach-recorded
   stat snapshots. The app opens public profiles and stores only values the
   coach deliberately records.
   ============================================================================= */
const Tracker = {};

Tracker.connected = c => !!(c && (c.trackerUrl || c.owName || c.owTag));
Tracker.profileUrl = function (c) {
  const custom = String(c && c.trackerUrl || '').trim();
  if (/^https?:\/\//i.test(custom)) return custom;
  const name = String(c && c.owName || '').trim();
  if (!name) return 'https://tracker.gg/overwatch';
  return `https://tracker.gg/overwatch/search?query=${encodeURIComponent(name)}`;
};
Tracker.displayId = c => [c && c.owName, c && c.owTag].filter(Boolean).join(' ') || 'Overwatch profile';
Tracker.value = function (value, suffix = '') {
  return value === '' || value == null || !Number.isFinite(+value) ? '-' : `${Math.round(+value * 100) / 100}${suffix}`;
};
Tracker.open = async function (clientId) {
  const c = getClient(clientId);
  if (!c) return;
  if (!Tracker.connected(c)) { UI.toast('Add this player profile link first.', 'bad'); Clients.edit(c.id); return; }
  const result = await window.api.openExternal(Tracker.profileUrl(c));
  if (!result || !result.success) UI.toast(result && result.msg || 'Could not open profile.', 'bad');
};
Tracker.metricTile = (label, value, suffix = '') => `<div class="stat-tile"><div class="label">${label}</div><div class="value accent">${Tracker.value(value, suffix)}</div></div>`;

Tracker.dashboardHtml = function (c) {
  const connected = Tracker.connected(c);
  const stats = c.trackerStats || null;
  if (!connected) return `<div class="card mb tracker-card"><div class="flex between center wrap gap">
    <div><h2>Overwatch profile</h2><p class="muted" style="font-size:.8rem">Add a public profile URL or BattleTag to open the player's profile from the dashboard.</p></div>
    <button class="btn" onclick="Clients.edit('${c.id}')">Add profile</button></div></div>`;

  return `<div class="card mb tracker-card">
    <div class="card-head"><div><h2>Overwatch profile snapshot</h2><div class="muted" style="font-size:.75rem">${UI.escape(Tracker.displayId(c))}${stats && stats.updatedAt ? ` - recorded ${UI.fmtDate(stats.updatedAt)}` : ' - no snapshot recorded yet'}</div></div>
      <div class="flex gap-sm wrap"><button class="btn btn-sm" onclick="Tracker.open('${c.id}')">Open profile</button><button class="btn btn-sm btn-primary" onclick="Tracker.snapshotEdit('${c.id}')">${stats ? 'Update snapshot' : 'Record snapshot'}</button></div></div>
    ${stats ? `<div class="stat-tiles mb">
      ${Tracker.metricTile('Games', stats.matches)}
      ${Tracker.metricTile('Win Rate', stats.winRate, '%')}
      ${Tracker.metricTile('Weapon Accuracy', stats.headshotPct, '%')}
      ${Tracker.metricTile('Elims / 10', stats.kd)}
      ${Tracker.metricTile('Damage / 10', stats.adr)}
      ${Tracker.metricTile('Healing / 10', stats.acs)}
    </div>
    <div class="flex between center gap wrap"><div class="muted" style="font-size:.74rem">${stats.rank ? `<b style="color:var(--text)">Rank:</b> ${UI.escape(stats.rank)}` : 'Rank not recorded'}${stats.notes ? ` - ${UI.escape(stats.notes)}` : ''}</div><button class="btn btn-xs btn-danger" onclick="Tracker.clearSnapshot('${c.id}')">Clear snapshot</button></div>` : '<p class="muted" style="font-size:.78rem">Open the public profile, then record the values you want preserved for coaching comparisons.</p>'}
    <div class="tracker-notice">KovaaK's Coach opens public Overwatch profile pages and does not scrape third-party sites or ask for Battle.net credentials.</div>
  </div>`;
};

Tracker.snapshotEdit = function (clientId) {
  const c = getClient(clientId);
  if (!c) return;
  const s = c.trackerStats || {};
  const f = key => UI.escape(s[key] ?? '');
  UI.modal(`<div class="modal-head"><h2>Overwatch Profile Snapshot</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="flex between center gap mb"><div><b>${UI.escape(c.name)}</b><div class="muted" style="font-size:.74rem">${UI.escape(Tracker.displayId(c))}</div></div><button class="btn btn-sm" onclick="Tracker.open('${c.id}')">Open profile</button></div>
    <div class="row">
      <label class="field"><span>Rank</span><input id="ts-rank" value="${f('rank')}" placeholder="Diamond 3"></label>
      <label class="field"><span>Games</span><input id="ts-matches" type="number" min="0" value="${f('matches')}"></label>
      <label class="field"><span>Win rate (%)</span><input id="ts-winRate" type="number" min="0" max="100" step="0.1" value="${f('winRate')}"></label>
    </div>
    <div class="row">
      <label class="field"><span>Weapon accuracy (%)</span><input id="ts-headshotPct" type="number" min="0" max="100" step="0.1" value="${f('headshotPct')}"></label>
      <label class="field"><span>Eliminations / 10</span><input id="ts-kd" type="number" min="0" step="0.01" value="${f('kd')}"></label>
      <label class="field"><span>Damage / 10</span><input id="ts-adr" type="number" min="0" step="0.1" value="${f('adr')}"></label>
      <label class="field"><span>Healing / 10</span><input id="ts-acs" type="number" min="0" step="0.1" value="${f('acs')}"></label>
    </div>
    <label class="field"><span>Snapshot note</span><input id="ts-notes" value="${f('notes')}" placeholder="Competitive - current season"></label>
    <p class="muted" style="font-size:.74rem">Enter only values visible on the public profile. Saving also updates matching development-plan metrics.</p>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Tracker.snapshotSave('${c.id}')">Save snapshot</button></div>`);
};
Tracker.number = function (id) {
  const raw = document.getElementById(id).value.trim();
  return raw === '' ? null : Math.max(0, +raw || 0);
};
Tracker.snapshotSave = function (clientId) {
  const c = getClient(clientId);
  if (!c) return;
  const winRate = Tracker.number('ts-winRate');
  const headshotPct = Tracker.number('ts-headshotPct');
  if ((winRate != null && winRate > 100) || (headshotPct != null && headshotPct > 100)) {
    UI.toast('Percentage values must be between 0 and 100.', 'bad'); return;
  }
  const snapshot = {
    id: uid(),
    rank: document.getElementById('ts-rank').value.trim(),
    matches: Tracker.number('ts-matches'),
    winRate, headshotPct,
    kd: Tracker.number('ts-kd'),
    adr: Tracker.number('ts-adr'),
    acs: Tracker.number('ts-acs'),
    notes: document.getElementById('ts-notes').value.trim(),
    source: 'profile snapshot',
    updatedAt: new Date().toISOString(),
  };
  c.trackerStats = snapshot;
  (c.trackerHistory ||= []).push({ ...snapshot });
  c.trackerHistory = c.trackerHistory
    .filter((item, index, all) => item && item.updatedAt && all.findIndex(x => x.updatedAt === item.updatedAt) === index)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(-120);
  if (c.trackerStats.rank) c.rank = c.trackerStats.rank;
  const goalsUpdated = typeof Plans !== 'undefined' && Plans.applyTrackerMetrics ? Plans.applyTrackerMetrics(c) : 0;
  saveDB(); UI.closeModal();
  UI.toast(`Profile snapshot saved${goalsUpdated ? ` - ${goalsUpdated} plan goal${goalsUpdated === 1 ? '' : 's'} updated` : ''}.`, 'good');
  UI.refresh();
};
Tracker.clearSnapshot = function (clientId) {
  UI.confirm('Clear this saved profile snapshot? The profile link will remain.', () => {
    const c = getClient(clientId);
    if (c) delete c.trackerStats;
    saveDB(); UI.refresh();
  }, { yes: 'Clear snapshot' });
};


