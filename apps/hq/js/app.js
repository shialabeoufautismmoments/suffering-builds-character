/* =============================================================================
   APP -boot & navigation glue
   ============================================================================= */
const App = {};

App.nav = (view) => {
  // Leaving the VOD review screen should tear down the embedded player.
  if (UI.currentView === 'vods' && view !== 'vods' && Vods.viewing) {
    Vods.destroyPlayer();
    Vods.viewing = null;
  }
  UI.nav(view);
};

App.boot = async function () {
  if (!Access.unlocked) await Access.bootstrap();
  if (App._booted) return;
  App._booted = true;
  await loadDB();
  await Sync.bootstrap();
  await Access.ensureCoach();
  if (typeof Data !== 'undefined' && Data.applyAll) Data.applyAll();
  if (window.api.appVersion) window.api.appVersion().then(v => { if (typeof Data !== 'undefined') Data._version = v; });
  UI.updateClientPill();

  // Seed a starter scenario library (tagged by category) on first run so autofill
  // and the Mechanics routine generator are useful immediately.
  if (Object.keys(DB.scenarios).length === 0 && typeof SCENARIO_CATALOG !== 'undefined') {
    SCENARIO_CATALOG.forEach(s => {
      const t = ensureScenario(s.name);
      t.category = s.category; t.subcategory = s.subcategory || ''; t.movement = !!s.movement;
    });
    saveDB();
  }

  // Backfill fields added in later versions.
  let migratedLegacyStats = false;
  DB.clients.forEach(c => {
    c.heroes ||= [];
    c.packages ||= [];
    c.benchmarkResults ||= {};
    c.prHistory ||= {};
    c.telemetryWatchlist ||= [];
    c.kovaaksWeb ||= {};
    c.clientKovaaksStats ||= [];
    c.priority ||= 0;
    c.developmentPlans ||= [];
    if (!c.trackerStats && c.valorant && c.valorant.stats) {
      const s = c.valorant.stats;
      c.trackerStats = {
        rank: c.rank || '', matches: s.games ?? null, winRate: s.winRate ?? null,
        headshotPct: s.headshotPct ?? null, kd: s.kd ?? null, adr: s.adr ?? null,
        acs: s.acs ?? null, notes: 'Migrated from legacy match integration',
        source: 'legacy', updatedAt: c.valorant.syncedAt || new Date().toISOString(),
      };
      migratedLegacyStats = true;
    }
    if (c.valorant || c.riotShard) {
      delete c.valorant;
      delete c.riotShard;
      migratedLegacyStats = true;
    }
    c.trackerHistory ||= [];
    if (c.trackerStats && c.trackerStats.updatedAt && !c.trackerHistory.some(x => x.updatedAt === c.trackerStats.updatedAt)) {
      c.trackerHistory.push({ id: c.trackerStats.id || uid(), ...c.trackerStats });
      migratedLegacyStats = true;
    }
    c.monthlyReports ||= {};
  });
  DB.reminders ||= [];
  DB.packageTemplates ||= [];
  DB.vods.forEach(v => {
    v.notes ||= [];
    v.reviewStatus ||= v.notes.length ? 'complete' : 'inbox';
  });
  DB.sessions.forEach(s => {
    s.prepMinutes ||= 0;
    (s.homework || []).forEach(h => { h.dueDate ||= ''; });
  });
  if (migratedLegacyStats) saveDB();

  // Launch reminder for any coaching sessions scheduled today.
  const todaySessions = (DB.scheduled || []).filter(s => !s.done && s.date === UI.today());
  if (!window.COACHSBC_WEB && todaySessions.length && 'Notification' in window) {
    try {
      const names = todaySessions.map(s => (getClient(s.clientId) || {}).name).filter(Boolean).join(', ');
      new Notification('CoachSBC HQ - sessions today', { body: `${todaySessions.length} scheduled: ${names}` });
    } catch (e) {}
  }

  // Quietly pull the latest Cal.com bookings into the schedule on launch.
  if (typeof Cal !== 'undefined' && Cal.hasKey && Cal.hasKey()) Cal.sync(true);

  App.nav('dashboard');
  Access.updateNav();
  if (typeof Telemetry !== 'undefined' && Telemetry.startupAutoSync) setTimeout(() => Telemetry.startupAutoSync(), 800);
  console.log('[KC] boot complete -clients=' + DB.clients.length + ' scenarios=' + Object.keys(DB.scenarios).length);
};

window.addEventListener('error', (e) => console.log('[KC] window error: ' + (e.message || e)));

window.addEventListener('DOMContentLoaded', App.boot);



