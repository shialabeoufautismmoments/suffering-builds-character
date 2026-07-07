/* =============================================================================
   MECHANICS BRIDGE -map an Overwatch hero pool to aim-training emphasis,
   then auto-generate a targeted KovaaK's routine.

   Hero scores are coaching heuristics on a 0- scale:
     c = clicking (static/flick precision)
     t = tracking (sustained on-target)
     s = switching (target acquisition between targets)
     mvt = strafe/movement aim matters
   ============================================================================= */
const Mechanics = {};

const ROLE_COLOR = { Tank: '#5aa9e6', Damage: '#e8833a', Support: '#71c177' };

const HEROES = [
  // -- Damage ----------------------------------------------------------------
  { name: 'Ashe',         role: 'Damage', c: 3, t: 0, s: 1, mvt: false, aim: 'Scoped flicks & static precision' },
  { name: 'Bastion',      role: 'Damage', c: 0, t: 3, s: 1, mvt: false, aim: 'Recon-mode sustained tracking' },
  { name: 'Cassidy',      role: 'Damage', c: 2, t: 1, s: 2, mvt: false, aim: 'Hitscan flicks + target switching' },
  { name: 'Echo',         role: 'Damage', c: 1, t: 2, s: 1, mvt: true,  aim: 'Tracking from the air' },
  { name: 'Freja',        role: 'Damage', c: 2, t: 1, s: 1, mvt: true,  aim: 'Projectile flicks on the move' },
  { name: 'Genji',        role: 'Damage', c: 1, t: 1, s: 1, mvt: true,  aim: 'Projectile + movement aim' },
  { name: 'Hanzo',        role: 'Damage', c: 3, t: 0, s: 1, mvt: false, aim: 'Projectile flick precision' },
  { name: 'Junkrat',      role: 'Damage', c: 0, t: 0, s: 0, mvt: true,  aim: 'Splash/prediction, low raw aim' },
  { name: 'Mei',          role: 'Damage', c: 1, t: 2, s: 0, mvt: false, aim: 'Beam tracking + icicle flicks' },
  { name: 'Pharah',       role: 'Damage', c: 0, t: 2, s: 0, mvt: true,  aim: 'Air-to-ground tracking' },
  { name: 'Reaper',       role: 'Damage', c: 0, t: 2, s: 1, mvt: true,  aim: 'Close-range tracking' },
  { name: 'Sojourn',      role: 'Damage', c: 2, t: 2, s: 1, mvt: false, aim: 'Rail charge tracking + flick' },
  { name: 'Soldier: 76',  role: 'Damage', c: 0, t: 3, s: 1, mvt: false, aim: 'Hitscan tracking' },
  { name: 'Sombra',       role: 'Damage', c: 0, t: 2, s: 1, mvt: true,  aim: 'Close tracking + repositioning' },
  { name: 'Symmetra',     role: 'Damage', c: 0, t: 2, s: 0, mvt: false, aim: 'Beam tracking' },
  { name: 'Torbjorn',     role: 'Damage', c: 1, t: 1, s: 1, mvt: false, aim: 'Mixed mid-range' },
  { name: 'Tracer',       role: 'Damage', c: 0, t: 3, s: 1, mvt: true,  aim: 'Reactive close tracking + strafe aim' },
  { name: 'Venture',      role: 'Damage', c: 1, t: 1, s: 1, mvt: true,  aim: 'Projectile + burrow movement' },
  { name: 'Widowmaker',   role: 'Damage', c: 3, t: 0, s: 1, mvt: false, aim: 'Static flick precision' },
  // -- Tank ------------------------------------------------------------------
  { name: 'D.Va',         role: 'Tank',   c: 0, t: 2, s: 0, mvt: true,  aim: 'Spread tracking, flight' },
  { name: 'Doomfist',     role: 'Tank',   c: 0, t: 0, s: 0, mvt: true,  aim: 'Ability-based, minimal aim' },
  { name: 'Hazard',       role: 'Tank',   c: 0, t: 1, s: 0, mvt: true,  aim: 'Spike burst + mobility' },
  { name: 'Junker Queen', role: 'Tank',   c: 1, t: 1, s: 1, mvt: false, aim: 'Shotgun + knife mixed' },
  { name: 'Mauga',        role: 'Tank',   c: 0, t: 2, s: 0, mvt: false, aim: 'Dual-minigun tracking' },
  { name: 'Orisa',        role: 'Tank',   c: 0, t: 2, s: 0, mvt: false, aim: 'Sustained tracking' },
  { name: 'Ramattra',     role: 'Tank',   c: 0, t: 1, s: 0, mvt: false, aim: 'Staff tracking' },
  { name: 'Reinhardt',    role: 'Tank',   c: 0, t: 0, s: 0, mvt: false, aim: 'Melee, no aim' },
  { name: 'Roadhog',      role: 'Tank',   c: 2, t: 1, s: 0, mvt: false, aim: 'Hook + burst flick' },
  { name: 'Sigma',        role: 'Tank',   c: 1, t: 1, s: 0, mvt: false, aim: 'Projectile lobs' },
  { name: 'Winston',      role: 'Tank',   c: 0, t: 0, s: 0, mvt: true,  aim: 'Auto-aim, movement only' },
  { name: 'Wrecking Ball',role: 'Tank',   c: 0, t: 0, s: 0, mvt: true,  aim: 'Movement, minimal aim' },
  { name: 'Zarya',        role: 'Tank',   c: 0, t: 3, s: 0, mvt: false, aim: 'Beam tracking' },
  // -- Support ---------------------------------------------------------------
  { name: 'Ana',          role: 'Support', c: 3, t: 0, s: 1, mvt: false, aim: 'Scoped precision + flicks' },
  { name: 'Baptiste',     role: 'Support', c: 2, t: 1, s: 1, mvt: false, aim: '3-round burst placement' },
  { name: 'Brigitte',     role: 'Support', c: 0, t: 0, s: 0, mvt: false, aim: 'Melee, no aim' },
  { name: 'Illari',       role: 'Support', c: 2, t: 1, s: 1, mvt: false, aim: 'Charged rifle precision' },
  { name: 'Juno',         role: 'Support', c: 0, t: 2, s: 0, mvt: true,  aim: 'Gun tracking + flight' },
  { name: 'Kiriko',       role: 'Support', c: 3, t: 0, s: 1, mvt: true,  aim: 'Kunai precision + wall-climb' },
  { name: 'Lifeweaver',   role: 'Support', c: 1, t: 1, s: 0, mvt: false, aim: 'Charged thorn aim' },
  { name: 'Lucio',        role: 'Support', c: 0, t: 1, s: 0, mvt: true,  aim: 'Movement, low aim' },
  { name: 'Mercy',        role: 'Support', c: 1, t: 0, s: 0, mvt: true,  aim: 'Situational pistol' },
  { name: 'Moira',        role: 'Support', c: 0, t: 1, s: 0, mvt: true,  aim: 'Soft-lock, low raw aim' },
  { name: 'Zenyatta',     role: 'Support', c: 2, t: 1, s: 1, mvt: false, aim: 'Orb volley precision' },
];

// Starter scenario catalog used to seed the library and fill gaps when the
// coach's own tagged library lacks coverage for a category.
// NOTE: workshop names drift -verify the exact name in KovaaK's before pushing.
const SCENARIO_CATALOG = [
  // Clicking
  { name: '1w6ts reload',                       category: 'Clicking',  subcategory: 'Static',     movement: false },
  { name: '1w4ts reload',                       category: 'Clicking',  subcategory: 'Static',     movement: false },
  { name: 'Tile Frenzy',                        category: 'Clicking',  subcategory: 'Static',     movement: false },
  { name: 'ww3t',                               category: 'Clicking',  subcategory: 'Dynamic',    movement: false },
  { name: 'Popcorn Sparky',                     category: 'Clicking',  subcategory: 'Dynamic',    movement: false },
  { name: '1w3ts reload',                        category: 'Clicking',  subcategory: 'Static',     movement: false },
  // Tracking
  { name: 'Pasu Track Invincible v2',           category: 'Tracking',  subcategory: 'Precise',    movement: false },
  { name: 'Thin Aiming Long Strafes Invincible',category: 'Tracking',  subcategory: 'Precise',    movement: true  },
  { name: 'Smoothbot',                          category: 'Tracking',  subcategory: 'Smoothness', movement: false },
  { name: 'Air Angelic 4 Stranger',             category: 'Tracking',  subcategory: 'Control',    movement: false },
  { name: 'Ground Plaza NM',                    category: 'Tracking',  subcategory: 'Control',    movement: true  },
  { name: 'Close Fast Strafes Invincible',      category: 'Tracking',  subcategory: 'Reactive',   movement: true  },
  // Switching
  { name: 'patTargetSwitch',                    category: 'Switching', subcategory: 'Stability',  movement: false },
  { name: 'kinTargetSwitch 6 Small',            category: 'Switching', subcategory: 'Speed',      movement: false },
  { name: '1wall6targets TS',                   category: 'Switching', subcategory: 'Stability',  movement: false },
];

Mechanics.hero = (name) => HEROES.find(h => h.name === name);

/* -- Profile computation ---------------------------------------------------- */
Mechanics.profile = function (client) {
  const pool = client.heroes || [];
  const totals = { Clicking: 0, Tracking: 0, Switching: 0 };
  let mvtWeight = 0, poolWeight = 0;
  pool.forEach(h => {
    const hero = Mechanics.hero(h.name);
    if (!hero) return;
    const w = h.main ? 2 : 1;
    poolWeight += w;
    totals.Clicking += hero.c * w;
    totals.Tracking += hero.t * w;
    totals.Switching += hero.s * w;
    if (hero.mvt) mvtWeight += w;
  });
  const sum = totals.Clicking + totals.Tracking + totals.Switching || 1;
  return {
    totals,
    pct: { Clicking: totals.Clicking / sum, Tracking: totals.Tracking / sum, Switching: totals.Switching / sum },
    movement: poolWeight ? mvtWeight / poolWeight >= 0.5 : false,
    poolWeight, sum,
  };
};

Mechanics.summary = function (client, prof) {
  if (!prof.poolWeight || !prof.sum) return 'Add heroes to compute a mechanics profile.';
  const ranked = ['Clicking', 'Tracking', 'Switching'].sort((a, b) => prof.pct[b] - prof.pct[a]);
  const top = ranked[0];
  const verdict = prof.pct[top] >= 0.5 ? `${top.toLowerCase()}-dominant` : 'balanced';
  const pcts = ranked.map(k => `${k} ${Math.round(prof.pct[k] * 100)}%`).join(' - ');
  return `${verdict} pool -${pcts}.${prof.movement ? ' Movement / strafe aim is emphasised.' : ''}`;
};

/* -- View ------------------------------------------------------------------- */
UI.renderers.mechanics = function (el) {
  if (UI.requireClient(el, 'Mechanics')) return;
  const c = activeClient();
  c.heroes ||= [];
  const prof = Mechanics.profile(c);

  const poolChips = c.heroes.length ? c.heroes.map(h => {
    const hero = Mechanics.hero(h.name) || { role: 'Damage' };
    const col = ROLE_COLOR[hero.role] || '#888';
    return `<span class="hero-chip" style="border-color:${col}">
      <span class="hero-dot" style="background:${col}"></span>${UI.escape(h.name)}
      <button class="hero-star ${h.main ? 'on' : ''}" title="Mark as main (2x weight)" onclick="Mechanics.toggleMain('${UI.attr(h.name)}')">main</button>
      <button class="hero-x" title="Remove" onclick="Mechanics.removeHero('${UI.attr(h.name)}')">x</button>
    </span>`;
  }).join('') : '<span class="muted" style="font-size:.84rem">No heroes yet -add this client\'s hero pool below.</span>';

  const bar = (k) => {
    const p = Math.round((prof.pct[k] || 0) * 100);
    const colors = { Clicking: '#e8833a', Tracking: '#5aa9e6', Switching: '#71c177' };
    return `<div class="mech-row">
      <span class="mech-label">${k}</span>
      <div class="mech-track"><div class="mech-fill" style="width:${p}%;background:${colors[k]}"></div></div>
      <span class="mech-pct">${p}%</span>
    </div>`;
  };

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Mechanics</h1><div class="sub">Bridge <b>${UI.escape(c.name)}</b>'s hero pool to the aim skills they need to train.</div></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Hero Pool</h2>${prof.poolWeight ? `<span class="muted" style="font-size:.78rem">*= main (2x weight)</span>` : ''}</div>
        <div class="hero-pool">${poolChips}</div>
        <div class="divider"></div>
        <div class="flex gap-sm">
          <div class="autofill-wrap" style="flex:1">
            <input id="hero-input" list="hero-list" placeholder="Add hero (type to search)..." onkeydown="if(event.key==='Enter')Mechanics.addFromInput()">
            <datalist id="hero-list">${HEROES.map(h => `<option value="${UI.escape(h.name)}">${h.role} -${UI.escape(h.aim)}</option>`).join('')}</datalist>
          </div>
          <button class="btn btn-primary" onclick="Mechanics.addFromInput()">Add</button>
        </div>
        <div class="role-quickadd mt-sm">
          ${['Tank', 'Damage', 'Support'].map(r => `<span class="muted" style="font-size:.74rem;color:${ROLE_COLOR[r]}">${r}:</span> ` +
            HEROES.filter(h => h.role === r).map(h => `<button class="mini-hero" onclick="Mechanics.addHero('${UI.attr(h.name)}')">${UI.escape(h.name)}</button>`).join('')).join('<div style="height:.35rem"></div>')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Mechanics Profile</h2></div>
        ${prof.poolWeight ? `
          ${bar('Clicking')}${bar('Tracking')}${bar('Switching')}
          ${prof.movement ? '<div class="tag accent mt-sm">Movement / strafe aim</div>' : ''}
          <div class="divider"></div>
          <p class="muted" style="font-size:.85rem">${UI.escape(Mechanics.summary(c, prof))}</p>
        ` : UI.emptyState('🧭', 'Add heroes to see the profile', '')}

        <div class="divider"></div>
        <h2 style="font-size:.95rem">Generate Routine</h2>
        <div class="row mt-sm">
          <label class="field" style="margin:0"><span>Length</span>
            <select id="gen-minutes"><option value="15">Quick -15 min</option><option value="30" selected>Standard -30 min</option><option value="45">Full -45 min</option></select></label>
          <label class="field" style="margin:0"><span>Mode</span>
            <select id="gen-mode">
              <option value="mirror" selected>Mirror hero pool</option>
              <option value="balanced">Balanced (cover all skills)</option>
            </select></label>
        </div>
        <button class="btn btn-primary mt" style="width:100%" ${prof.poolWeight ? '' : 'disabled'} onclick="Mechanics.generate()">* Generate &amp; open in builder</button>
        <p class="muted" style="font-size:.74rem;margin-top:.5rem">Pulls from this client's tagged library first; suggested fallbacks are marked -verify names before pushing to KovaaK's.</p>
      </div>
    </div>`;
};

/* -- Hero pool editing ------------------------------------------------------ */
Mechanics.addFromInput = function () {
  const input = document.getElementById('hero-input');
  if (input && input.value.trim()) { Mechanics.addHero(input.value.trim()); input.value = ''; }
};
Mechanics.addHero = function (name) {
  const hero = Mechanics.hero(name);
  if (!hero) { UI.toast(`"${name}" isn't a recognised hero.`, 'bad'); return; }
  const c = activeClient();
  c.heroes ||= [];
  if (c.heroes.some(h => h.name === hero.name)) { UI.toast(`${hero.name} already in pool.`); return; }
  c.heroes.push({ name: hero.name, main: false });
  saveDB();
  UI.refresh();
};
Mechanics.removeHero = function (name) {
  const c = activeClient();
  c.heroes = (c.heroes || []).filter(h => h.name !== name);
  saveDB();
  UI.refresh();
};
Mechanics.toggleMain = function (name) {
  const c = activeClient();
  const h = (c.heroes || []).find(x => x.name === name);
  if (h) { h.main = !h.main; saveDB(); UI.refresh(); }
};

/* -- Scenario selection ----------------------------------------------------- */
Mechanics.pickScenarios = function (category, preferMovement, count) {
  // 1) the coach's own tagged library (guaranteed-real names)
  const lib = Object.keys(DB.scenarios)
    .filter(n => DB.scenarios[n].category === category)
    .map(n => ({ name: n, ...DB.scenarios[n], suggested: false }));
  // 2) catalog fallbacks not already in the library
  const cat = SCENARIO_CATALOG
    .filter(s => s.category === category && !DB.scenarios[s.name])
    .map(s => ({ ...s, suggested: true }));

  let candidates = lib.concat(cat);
  if (preferMovement) candidates.sort((a, b) => (b.movement ? 1 : 0) - (a.movement ? 1 : 0));
  // de-dup by subcategory for variety, then top up
  const bySub = [], seenSub = new Set(), rest = [];
  candidates.forEach(s => {
    const key = s.subcategory || s.name;
    if (!seenSub.has(key)) { seenSub.add(key); bySub.push(s); } else rest.push(s);
  });
  return bySub.concat(rest).slice(0, Math.max(1, count));
};

Mechanics.generate = function () {
  const c = activeClient();
  if (!c.heroes || !c.heroes.length) { UI.toast('Add heroes first.', 'bad'); return; }
  const minutes = parseInt(document.getElementById('gen-minutes').value) || 30;
  const mode = document.getElementById('gen-mode').value;
  const prof = Mechanics.profile(c);

  // Category weights ->rep allocation.
  const cats = ['Clicking', 'Tracking', 'Switching'];
  const alloc = {};
  cats.forEach(k => {
    alloc[k] = mode === 'balanced' ? 0.2 + 0.4 * prof.pct[k] : prof.pct[k];
  });
  const repsPer = {};
  cats.forEach(k => { repsPer[k] = Math.round(minutes * alloc[k]); });

  const scenarios = [];
  let suggestedCount = 0;
  cats.forEach(cat => {
    let budget = repsPer[cat];
    if (budget <= 0) return;
    const nDistinct = Math.max(1, Math.min(4, Math.round(budget / 4)));
    const picks = Mechanics.pickScenarios(cat, prof.movement, nDistinct);
    picks.forEach(p => {
      const reps = Math.max(2, Math.round(budget / picks.length));
      scenarios.push({ name: p.name, reps });
      // grow the library with any catalog-sourced picks so they're tagged + reusable
      const t = ensureScenario(p.name);
      if (!t.category) { t.category = cat; t.subcategory = p.subcategory || ''; t.movement = !!p.movement; }
      if (p.suggested) suggestedCount++;
    });
  });

  if (!scenarios.length) { UI.toast('Could not allocate scenarios -add category tags to your library.', 'bad'); return; }

  const name = `${c.name} -Hero Routine (${minutes}m)`;
  const note = Mechanics.summary(c, prof);
  const pl = { id: uid(), clientId: c.id, name, scenarios: JSON.parse(JSON.stringify(scenarios)), notes: note, createdAt: new Date().toISOString() };
  DB.playlists.push(pl);
  Playlists.builder = { id: pl.id, name, scenarios: JSON.parse(JSON.stringify(scenarios)) };
  saveDB();

  UI.toast(`Generated "${name}"${suggestedCount ? ` (${suggestedCount} suggested scenario${suggestedCount > 1 ? 's' : ''} -verify names)` : ''}.`, 'good');
  App.nav('playlists');
};


