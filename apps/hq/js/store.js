/* =============================================================================
   STORE -persistent application state
   ============================================================================= */
const DB = {
  clients: [],          // [{ id, name, game, rank, avatar, trackerStats, trackerHistory:[], monthlyReports:{}, developmentPlans:[], ... }]
  scenarios: {},        // { [name]: { category, subcategory, movement, antiMovement, note } } -shared scenario library
  playlists: [],        // [{ id, clientId, name, scenarios:[{name, reps}], notes, createdAt }]
  vods: [],             // [{ id, clientId, title, reviewStatus, platform, videoId, url, date, scenario, summary, notes:[{id,t,text,tag,severity}], createdAt }]
  matches: [],          // [{ id, clientId, date, type, role, map, mode, heroes:[name], result, rankBefore, rankAfter, sr, enemyComp, replayCode, notes, createdAt }]
  sessions: [],         // [{ id, clientId, date, durationMin, prepMinutes, topics, notes, homework:[{id,text,type,dueDate,done}], createdAt }]
  playbook: {},         // { [mapName]: { notes } } -reusable OW map knowledge base, shared across clients
  leads: [],            // [{ id, discord, name, game, rank, contactDate, notes, createdAt }] -prospective-client waitlist
  benchmarks: [],       // [{ id, name, ranks:[name], scenarios:[{id,name,metric,thresholds:[value]}], createdAt }] -coach-defined benchmarks
  scheduled: [],        // [{ id, clientId, date, time, notes, done, recurId }] -upcoming coaching sessions
  reminders: [],        // [{ id, clientId, text, dueDate, done, createdAt }] -coach follow-ups
  packageTemplates: [], // [{ id, name, total, price, description, createdAt }] -reusable across clients
  coaches: [],          // [{ id, name, role, color }] -shared team profiles
  cloud: { revision: 0, updatedAt: null },
  settings: {},         // { businessName, accent, updateUrl }
  activeClientId: null,
};

const SCENARIO_CATS = {
  Clicking: ['Static', 'Pokeball', 'Dynamic', 'Linear'],
  Tracking: ['Precise', 'Smoothness', 'Control', 'Reactive', 'Raw Reactive'],
  Switching: ['Stability', 'Evasive', 'Speed'],
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

async function loadDB() {
  try {
    const raw = await window.api.loadStore();
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(DB, parsed);
      // Backfill any missing top-level keys from older saves.
      DB.clients ||= []; DB.scenarios ||= {}; DB.playlists ||= []; DB.vods ||= [];
      DB.matches ||= []; DB.sessions ||= []; DB.playbook ||= {}; DB.leads ||= [];
      DB.benchmarks ||= []; DB.scheduled ||= []; DB.reminders ||= []; DB.packageTemplates ||= []; DB.settings ||= {};
      DB.coaches ||= []; DB.cloud ||= { revision: 0, updatedAt: null };
    }
  } catch (e) { console.error('loadDB failed', e); }
}

let _saveTimer = null;
function saveDB() {
  DB.cloud ||= { revision: 0, updatedAt: null };
  DB.cloud.localUpdatedAt = new Date().toISOString();
  const coachId = typeof Access !== 'undefined' ? Access.currentCoachId : null;
  if (coachId) {
    ['clients', 'playlists', 'vods', 'matches', 'sessions', 'leads', 'benchmarks', 'scheduled', 'reminders', 'packageTemplates'].forEach(key => {
      (DB[key] || []).forEach(item => {
        if (!item.coachId) item.coachId = coachId;
      });
    });
  }
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    window.api.saveStore(JSON.stringify(DB))
      .then(ok => { if (ok && typeof Sync !== 'undefined' && Sync.onLocalSave) Sync.onLocalSave(); })
      .catch(e => console.error('saveDB failed', e));
  }, 250);
}

/* -- Accessors -------------------------------------------------------------- */
function activeClient() { return DB.clients.find(c => c.id === DB.activeClientId) || null; }
function getClient(id) { return DB.clients.find(c => c.id === id) || null; }
function clientPlaylists(id) { return DB.playlists.filter(p => p.clientId === id); }
function clientVods(id) { return DB.vods.filter(v => v.clientId === id); }
function clientMatches(id) { return DB.matches.filter(m => m.clientId === id); }
function clientSessions(id) { return DB.sessions.filter(s => s.clientId === id); }

function ensureScenario(name) {
  if (!DB.scenarios[name]) {
    DB.scenarios[name] = { category: '', subcategory: '', movement: false, antiMovement: false, note: '' };
  }
  return DB.scenarios[name];
}


