/* =============================================================================
   PLAYLISTS -scenario builder, library, KovaaK's import/export, Steam push
   ============================================================================= */
const Playlists = {};

// Working builder state
Playlists.builder = { id: null, name: '', scenarios: [] };
Playlists._drag = null;

UI.renderers.playlists = function (el) {
  if (UI.requireClient(el, 'Playlists')) return;
  const c = activeClient();

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Playlists</h1><div class="sub">Building for <b>${UI.escape(c.name)}</b>. Tags & notes are shared across your scenario library.</div></div>
      <div class="flex gap-sm">
        <button class="btn" onclick="App.nav('mechanics')">* Generate from heroes</button>
        <button class="btn" onclick="Playlists.import()">Import KovaaK's JSON</button>
      </div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h2>Builder</h2><span class="muted" id="builder-est" style="font-size:.8rem"></span></div>
        <div class="flex gap-sm mb">
          <div class="autofill-wrap">
            <input id="scn-input" placeholder="Scenario name..." autocomplete="off"
              oninput="Playlists.autofill(this.value)" onkeydown="Playlists.inputKey(event)">
            <div class="autofill-list" id="autofill-list"></div>
          </div>
          <button class="btn btn-primary" onclick="Playlists.addFromInput()">Add</button>
        </div>
        <div id="builder-list" style="min-height:120px;max-height:46vh;overflow-y:auto"></div>
        <div class="divider"></div>
        <div class="flex gap-sm mb">
          <input id="pl-name" placeholder="Playlist name" value="${UI.escape(Playlists.builder.name)}">
        </div>
        <div class="flex gap-sm wrap">
          <button class="btn btn-primary" onclick="Playlists.save()">Save to ${UI.escape(c.name)}</button>
          <button class="btn" onclick="Playlists.exportJson()">Export JSON</button>
          <button class="btn btn-gold" onclick="Playlists.pushSteam()">Push to KovaaK's</button>
          <button class="btn btn-ghost" onclick="Playlists.clearBuilder()">Clear</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>${UI.escape(c.name)}'s Library</h2></div>
        <div id="pl-library"></div>
      </div>
    </div>`;

  Playlists.renderBuilder();
  Playlists.renderLibrary();
};

/* -- Autofill --------------------------------------------------------------- */
Playlists._afIndex = -1;
Playlists.autofill = function (v) {
  const list = document.getElementById('autofill-list');
  v = v.toLowerCase().trim();
  Playlists._afIndex = -1;
  if (!v) { list.style.display = 'none'; return; }
  const matches = Object.keys(DB.scenarios).filter(s => s.toLowerCase().includes(v)).slice(0, 12);
  if (!matches.length) { list.style.display = 'none'; return; }
  list.innerHTML = matches.map(m => `<div class="autofill-item" onclick="Playlists.pick('${UI.attr(m)}')">${UI.escape(m)}</div>`).join('');
  list.style.display = 'block';
};
Playlists.pick = function (name) {
  Playlists.addScenario(name);
  document.getElementById('scn-input').value = '';
  document.getElementById('autofill-list').style.display = 'none';
  document.getElementById('scn-input').focus();
};
Playlists.inputKey = function (e) {
  const list = document.getElementById('autofill-list');
  const items = [...list.querySelectorAll('.autofill-item')];
  if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); Playlists._afIndex = Math.min(Playlists._afIndex + 1, items.length - 1); }
  else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); Playlists._afIndex = Math.max(Playlists._afIndex - 1, 0); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (Playlists._afIndex >= 0 && items[Playlists._afIndex]) items[Playlists._afIndex].click();
    else Playlists.addFromInput();
    return;
  } else if (e.key === 'Escape') { list.style.display = 'none'; return; }
  items.forEach((it, i) => it.classList.toggle('hl', i === Playlists._afIndex));
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('.autofill-wrap')) {
    const l = document.getElementById('autofill-list'); if (l) l.style.display = 'none';
  }
});

Playlists.addFromInput = function () {
  const input = document.getElementById('scn-input');
  const v = input.value.trim();
  if (!v) return;
  Playlists.addScenario(v);
  input.value = '';
  document.getElementById('autofill-list').style.display = 'none';
  input.focus();
};
Playlists.addScenario = function (name) {
  const existing = Playlists.builder.scenarios.find(s => s.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.reps += 1;
  else Playlists.builder.scenarios.push({ name, reps: 1 });
  ensureScenario(name);
  saveDB();
  Playlists.renderBuilder();
};
Playlists.updateReps = function (i, d) {
  const s = Playlists.builder.scenarios[i];
  s.reps += d;
  if (s.reps <= 0) Playlists.builder.scenarios.splice(i, 1);
  Playlists.renderBuilder();
};

/* -- Builder render (with shared tag editing) ------------------------------- */
Playlists.renderBuilder = function () {
  const cont = document.getElementById('builder-list');
  if (!cont) return;
  const b = Playlists.builder;
  document.getElementById('builder-est').textContent = `${b.scenarios.length} scenarios - ~${b.scenarios.reduce((s, x) => s + x.reps, 0)} min`;

  if (!b.scenarios.length) { cont.innerHTML = '<div class="muted" style="text-align:center;padding:1.5rem;font-size:.84rem">Builder empty -add scenarios above.</div>'; return; }

  cont.innerHTML = b.scenarios.map((item, index) => {
    const t = ensureScenario(item.name);
    const cats = Object.keys(SCENARIO_CATS).map(cat => `<option ${t.category === cat ? 'selected' : ''}>${cat}</option>`).join('');
    const subs = (SCENARIO_CATS[t.category] || []).map(s => `<option ${t.subcategory === s ? 'selected' : ''}>${s}</option>`).join('');
    const nm = UI.attr(item.name);
    return `
      <div class="scn-item" draggable="true"
        ondragstart="Playlists._drag=${index}"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="Playlists.drop(${index})">
        <div class="scn-head">
          <span class="scn-name">${UI.escape(item.name)}</span>
          <div class="counter">
            <button class="btn btn-xs" onclick="Playlists.updateReps(${index},-1)">-</button>
            <span class="n">${item.reps}</span>
            <button class="btn btn-xs" onclick="Playlists.updateReps(${index},1)">+</button>
            <button class="btn btn-xs btn-danger" onclick="Playlists.updateReps(${index},-999)">x</button>
          </div>
        </div>
        <div class="flex gap-sm mt-sm">
          <select onchange="Playlists.tag('${nm}','category',this.value)"><option value="">Category...</option>${cats}</select>
          <select onchange="Playlists.tag('${nm}','subcategory',this.value)" ${!t.category ? 'disabled' : ''}><option value="">Sub...</option>${subs}</select>
        </div>
        <div class="movement-tags">
          <label><input type="checkbox" ${t.movement ? 'checked' : ''} onchange="Playlists.tag('${nm}','movement',this.checked)"> Movement</label>
          <label><input type="checkbox" ${t.antiMovement ? 'checked' : ''} onchange="Playlists.tag('${nm}','antiMovement',this.checked)"> Anti-Movement</label>
        </div>
        <textarea class="mt-sm" style="min-height:42px;font-size:.8rem" placeholder="Coach note for this scenario..."
          onblur="Playlists.tag('${nm}','note',this.value)">${UI.escape(t.note || '')}</textarea>
      </div>`;
  }).join('');
};

Playlists.drop = function (index) {
  const from = Playlists._drag;
  if (from === null || from === index) { Playlists.renderBuilder(); return; }
  const moved = Playlists.builder.scenarios.splice(from, 1)[0];
  Playlists.builder.scenarios.splice(index, 0, moved);
  Playlists._drag = null;
  Playlists.renderBuilder();
};

Playlists.tag = function (name, field, value) {
  const t = ensureScenario(name);
  t[field] = value;
  if (field === 'category') t.subcategory = '';
  saveDB();
  if (field === 'category' || field === 'movement' || field === 'antiMovement') Playlists.renderBuilder();
};

/* -- Library ---------------------------------------------------------------- */
Playlists.renderLibrary = function () {
  const cont = document.getElementById('pl-library');
  if (!cont) return;
  const pls = clientPlaylists(activeClient().id);
  if (!pls.length) { cont.innerHTML = '<div class="muted" style="font-size:.82rem">No saved playlists. Build one and hit Save.</div>'; return; }
  cont.innerHTML = pls.map(p => `
    <div class="flex between center" style="padding:.55rem 0;border-bottom:1px solid var(--border-soft)">
      <div>
        <b>${UI.escape(p.name)}</b>
        <div class="muted" style="font-size:.76rem">${p.scenarios.length} scenarios - ~${p.scenarios.reduce((s, x) => s + x.reps, 0)} min</div>
      </div>
      <div class="flex gap-sm">
        <button class="btn btn-xs" onclick="Playlists.loadToBuilder('${p.id}')">Load</button>
        <button class="btn btn-xs btn-ghost" onclick="Cards.routine('${p.id}')" title="Copy routine card for Discord">🖼</button>
        <button class="btn btn-xs btn-ghost" onclick="Cards.routine('${p.id}', true)" title="Post routine card to Discord">📨</button>
        <button class="btn btn-xs btn-ghost" onclick="Playlists.duplicate('${p.id}')">Copy</button>
        <button class="btn btn-xs btn-danger" onclick="Playlists.remove('${p.id}')">Del</button>
      </div>
    </div>`).join('');
};

Playlists.save = function () {
  const b = Playlists.builder;
  if (!b.scenarios.length) { UI.toast('Builder is empty.', 'bad'); return; }
  const name = (document.getElementById('pl-name').value.trim()) || 'Routine';
  const c = activeClient();

  let pl = b.id ? DB.playlists.find(p => p.id === b.id) : null;
  if (pl) {
    pl.name = name;
    pl.scenarios = JSON.parse(JSON.stringify(b.scenarios));
  } else {
    pl = { id: uid(), clientId: c.id, name, scenarios: JSON.parse(JSON.stringify(b.scenarios)), notes: '', createdAt: new Date().toISOString() };
    DB.playlists.push(pl);
    b.id = pl.id;
  }
  b.name = name;
  saveDB();
  UI.toast(`Saved "${name}".`, 'good');
  Playlists.renderLibrary();
};

Playlists.loadToBuilder = function (id) {
  const p = DB.playlists.find(x => x.id === id);
  if (!p) return;
  Playlists.builder = { id: p.id, name: p.name, scenarios: JSON.parse(JSON.stringify(p.scenarios)) };
  if (document.getElementById('pl-name')) {
    document.getElementById('pl-name').value = p.name;
    Playlists.renderBuilder();
  }
};

Playlists.clearBuilder = function () {
  Playlists.builder = { id: null, name: '', scenarios: [] };
  if (document.getElementById('pl-name')) document.getElementById('pl-name').value = '';
  Playlists.renderBuilder();
};

Playlists.duplicate = function (id) {
  const p = DB.playlists.find(x => x.id === id);
  if (!p) return;
  DB.playlists.push({ ...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + ' (Copy)', createdAt: new Date().toISOString() });
  saveDB();
  Playlists.renderLibrary();
};

Playlists.remove = function (id) {
  const p = DB.playlists.find(x => x.id === id);
  UI.confirm(`Delete playlist "${p.name}"?`, () => {
    DB.playlists = DB.playlists.filter(x => x.id !== id);
    if (Playlists.builder.id === id) Playlists.builder.id = null;
    saveDB();
    Playlists.renderLibrary();
  });
};

/* -- KovaaK's JSON helpers -------------------------------------------------- */
Playlists.toKovaaks = function (name, scenarios) {
  return JSON.stringify({
    playlistName: name,
    scenarioList: scenarios.map(s => ({ scenarioName: s.name, playCount: s.reps })),
    authorName: 'KovaaK\'s Coach',
  }, null, 4);
};

Playlists.exportJson = function () {
  const b = Playlists.builder;
  if (!b.scenarios.length) { UI.toast('Builder is empty.', 'bad'); return; }
  const name = (document.getElementById('pl-name').value.trim()) || 'Routine';
  window.api.exportJson(name + '.json', Playlists.toKovaaks(name, b.scenarios))
    .then(r => UI.toast(r.success ? 'Exported.' : r.msg, r.success ? 'good' : 'bad'));
};

Playlists.pushSteam = function () {
  const b = Playlists.builder;
  if (!b.scenarios.length) { UI.toast('Builder is empty.', 'bad'); return; }
  const name = (document.getElementById('pl-name').value.trim()) || 'Routine';
  window.api.pushToSteam(name, Playlists.toKovaaks(name, b.scenarios))
    .then(r => UI.toast(r.msg, r.success ? 'good' : 'bad'));
};

Playlists.parse = function (text, fallbackName) {
  text = text.replace(/^\uFEFF/, '').replace(/\0/g, '').replace(/,(?=\s*[}\]])/gm, '');
  const build = (list, pName) => {
    const out = [];
    list.forEach(i => {
      const n = i.scenario_name || i.scenarioName;
      const reps = parseInt(i.play_Count || i.playCount) || 1;
      if (n) out.push({ name: n, reps });
    });
    return out.length ? { name: pName, scenarios: out } : null;
  };
  try {
    const data = JSON.parse(text);
    if (data.scenarioList) return build(data.scenarioList, data.playlistName || fallbackName);
    throw new Error();
  } catch {
    const out = [];
    const r = /"scenario_?name"\s*:\s*"([^"]+)"/gi; let m;
    while ((m = r.exec(text)) !== null) out.push({ name: m[1], reps: 1 });
    if (!out.length) return null;
    const nm = /"playlistName"\s*:\s*"([^"]+)"/i.exec(text);
    return { name: nm ? nm[1] : fallbackName, scenarios: out, recovered: true };
  }
};

Playlists.import = async function () {
  const files = await window.api.importPlaylists();
  if (!files) return;
  const c = activeClient();
  let imported = 0, recovered = 0, last = null;
  files.forEach(f => {
    const res = Playlists.parse(f.content, f.name.replace(/\.json$/i, ''));
    if (!res) return;
    res.scenarios.forEach(s => ensureScenario(s.name));
    DB.playlists.push({ id: uid(), clientId: c.id, name: res.name, scenarios: res.scenarios, notes: '', createdAt: new Date().toISOString() });
    imported++; if (res.recovered) recovered++; last = res;
  });
  if (!imported) { UI.toast('No valid playlists found.', 'bad'); return; }
  saveDB();
  if (imported === 1 && last) {
    Playlists.builder = { id: null, name: last.name, scenarios: JSON.parse(JSON.stringify(last.scenarios)) };
  }
  UI.refresh();
  UI.toast(`Imported ${imported} playlist(s)${recovered ? ` (${recovered} recovered)` : ''}.`, 'good');
};


