/* =============================================================================
   VOD REVIEWS -YouTube / Twitch embedding with timestamped coaching notes
   ============================================================================= */
const Vods = {};

Vods.viewing = null;   // id of VOD currently open in the review screen
Vods.player = null;    // { type, instance, getTime(), seek(sec), ready }

const TAGS = {
  mistake: 'Mistake', good: 'Good play', drill: 'Drill / homework', key: 'Key moment',
};
const SEVERITY = { 1: '#3fb950', 2: '#e3b341', 3: '#f85149' };

// One-click note prompts for fast, consistent OW reviews.
const VOD_TEMPLATES = ['Positioning', 'Ult economy', 'Cooldown usage', 'Target priority', 'Crosshair placement', 'Trade discipline', 'Cover usage', 'Tempo / timing'];
const VOD_STATUS = { inbox: 'Needs review', in_review: 'In review', complete: 'Reviewed' };

Vods.status = v => v.reviewStatus || ((v.notes || []).length ? 'complete' : 'inbox');
Vods.toggleComplete = function (id) {
  const v = DB.vods.find(x => x.id === id);
  if (!v) return;
  v.reviewStatus = Vods.status(v) === 'complete' ? 'in_review' : 'complete';
  v.reviewedAt = v.reviewStatus === 'complete' ? new Date().toISOString() : '';
  saveDB();
  UI.toast(v.reviewStatus === 'complete' ? 'VOD marked reviewed.' : 'VOD moved back to review.', 'good');
  UI.refresh();
};

/* -- URL parsing ------------------------------------------------------------ */
Vods.parseUrl = function (url) {
  url = (url || '').trim();
  let m;
  if ((m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/))([A-Za-z0-9_-]{11})/)))
    return { platform: 'youtube', videoId: m[1] };
  if ((m = url.match(/twitch\.tv\/videos\/(\d+)/)))
    return { platform: 'twitch', videoId: m[1] };
  if ((m = url.match(/^([A-Za-z0-9_-]{11})$/))) return { platform: 'youtube', videoId: m[1] };
  return null;
};

// Deep link with timestamp -used in notes and exported PDFs.
Vods.deepLink = function (vod, sec) {
  if (vod.platform === 'youtube') return `https://youtu.be/${vod.videoId}?t=${Math.floor(sec)}`;
  if (vod.platform === 'twitch') return `https://www.twitch.tv/videos/${vod.videoId}?t=${UI.hms(sec)}`;
  return vod.url;
};

/* -- List view -------------------------------------------------------------- */
UI.renderers.vods = function (el) {
  if (UI.requireClient(el, 'VOD Reviews')) return;
  if (Vods.viewing) { Vods.renderReview(el); return; }
  const c = activeClient();
  const vds = clientVods(c.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  el.innerHTML = `
    <div class="page-head">
      <div><h1>VOD Reviews</h1><div class="sub">Timestamped review for <b>${UI.escape(c.name)}</b>. Paste a YouTube or Twitch link.</div></div>
      <button class="btn btn-primary" onclick="Vods.edit()">+ Add VOD</button>
    </div>
    ${vds.length ? `<div class="grid cols-3">${vds.map(Vods.cardHtml).join('')}</div>`
      : UI.emptyState('🎬', 'No VODs yet', 'Add a YouTube or Twitch VOD to start timestamping.')}`;
};

Vods.cardHtml = function (v) {
  const badge = v.platform === 'youtube' ? '> YouTube' : '🟣 Twitch';
  return `
    <div class="card">
      <div class="flex between center">
        <span class="tag accent">${badge}</span>
        <span class="muted" style="font-size:.76rem">${UI.fmtDate(v.date)}</span>
      </div>
      <h2 style="margin:.5rem 0 .3rem;font-size:1rem">${UI.escape(v.title)}</h2>
      <div class="muted" style="font-size:.78rem">${v.notes.length} note${v.notes.length !== 1 ? 's' : ''}${v.scenario ? ' - ' + UI.escape(v.scenario) : ''}</div>
      <div class="flex gap-sm mt">
        <button class="btn btn-sm btn-primary" onclick="Vods.open('${v.id}')">Review</button>
        <button class="btn btn-sm btn-ghost" onclick="Vods.edit('${v.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="Vods.remove('${v.id}')">Del</button>
      </div>
    </div>`;
};

/* -- Add / edit metadata ---------------------------------------------------- */
Vods.edit = function (id) {
  const v = id ? DB.vods.find(x => x.id === id) : null;
  const f = (k, d = '') => UI.escape(v ? (v[k] ?? d) : d);
  const scenarioList = Object.keys(DB.scenarios).sort().map(s => `<option value="${UI.escape(s)}">`).join('');
  UI.modal(`
    <div class="modal-head"><h2>${v ? 'Edit VOD' : 'Add VOD'}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <label class="field"><span>YouTube / Twitch URL</span><input id="v-url" value="${f('url')}" placeholder="https://youtu.be/... or https://twitch.tv/videos/..."></label>
    <label class="field"><span>Title</span><input id="v-title" value="${f('title')}" placeholder="Scrim review -Map X"></label>
    <div class="row">
      <label class="field"><span>Review date</span><input id="v-date" type="date" value="${f('date', UI.today())}"></label>
      <label class="field"><span>Focus scenario (optional)</span><input id="v-scenario" list="v-scn-list" value="${f('scenario')}" placeholder="e.g. VT Pasu Voltaic"><datalist id="v-scn-list">${scenarioList}</datalist></label>
    </div>
    <label class="field"><span>Session summary (optional)</span><textarea id="v-summary" placeholder="Top-line takeaways for this VOD...">${f('summary')}</textarea></label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Vods.save('${id || ''}')">${v ? 'Save' : 'Add'}</button>
    </div>`);
};

Vods.save = function (id) {
  const url = document.getElementById('v-url').value.trim();
  const title = document.getElementById('v-title').value.trim();
  const parsed = Vods.parseUrl(url);
  if (!parsed) { UI.toast('Could not recognise that YouTube/Twitch URL.', 'bad'); return; }
  if (!title) { UI.toast('Title is required.', 'bad'); return; }
  const data = {
    url, title, platform: parsed.platform, videoId: parsed.videoId,
    date: document.getElementById('v-date').value || UI.today(),
    scenario: document.getElementById('v-scenario').value.trim(),
    summary: document.getElementById('v-summary').value.trim(),
  };
  if (id) {
    Object.assign(DB.vods.find(x => x.id === id), data);
  } else {
    DB.vods.push({ id: uid(), clientId: activeClient().id, ...data, notes: [], createdAt: new Date().toISOString() });
  }
  saveDB();
  UI.closeModal();
  UI.toast('VOD saved.', 'good');
  UI.refresh();
};

Vods.remove = function (id) {
  const v = DB.vods.find(x => x.id === id);
  UI.confirm(`Delete VOD "${v.title}" and its notes?`, () => {
    DB.vods = DB.vods.filter(x => x.id !== id);
    saveDB();
    UI.toast('VOD deleted.');
    UI.refresh();
  });
};

/* -- Review screen ---------------------------------------------------------- */
Vods.open = function (id) {
  Vods.viewing = id;
  App.nav('vods');
};
Vods.back = function () {
  Vods.destroyPlayer();
  Vods.viewing = null;
  App.nav('vods');
};

Vods.renderReview = function (el) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  if (!v) { Vods.viewing = null; UI.renderers.vods(el); return; }

  const vodWidth = (DB.settings || {}).vodWidth || '0';
  el.innerHTML = `
    <div class="page-head">
      <div class="flex center gap-sm">
        <button class="btn btn-sm btn-ghost" onclick="Vods.back()">->VODs</button>
        <div><h1 style="font-size:1.25rem">${UI.escape(v.title)}</h1>
          <div class="sub">${v.platform === 'youtube' ? 'YouTube' : 'Twitch'} - ${UI.fmtDate(v.date)}${v.scenario ? ' - ' + UI.escape(v.scenario) : ''}</div></div>
      </div>
      <div class="flex gap-sm">
        <button class="btn" onclick="Cards.vodSummary('${v.id}')" title="Copy a branded summary image for Discord">🖼 Card</button>
        <button class="btn" onclick="Cards.vodSummary('${v.id}', true)" title="Post the summary card to this client's Discord">📨 Post</button>
        <button class="btn" onclick="Vods.copyMarkdown()" title="Copy notes as Markdown for Discord">Copy for Discord</button>
        <button class="btn" onclick="Vods.copyGoogleDocs()" title="Copy notes as rich text for Google Docs (with embedded snapshots)">📄 Google Docs</button>
        <button class="btn" onclick="Reports.vod('${v.id}')">Export PDF</button>
      </div>
    </div>
    <div class="vod-layout">
      <div>
        <div class="flex gap-sm center mb-sm" style="font-size:.78rem">
          <span class="muted">Player size:</span>
          ${[['S','640'],['M','854'],['L','1280'],['Full','0']].map(([lbl,w]) => `<button class="btn btn-xs${vodWidth===w?' btn-primary':' btn-ghost'}" data-vw="${w}" onclick="Vods.setWidth('${w}')">${lbl}</button>`).join('')}
        </div>
        <div class="player-shell" id="player-shell">
          <div class="player-empty" id="player-empty">Loading player...</div>
        </div>
        <div class="tele-bar" id="tele-bar">
          <button class="btn btn-sm" id="tele-toggle" onclick="Telestrator.toggle()" title="Pause the video, then draw">*Draw</button>
          <div class="tele-tools">
            <button class="tele-t" data-tool="arrow" title="Arrow" onclick="Telestrator.setTool('arrow')">-&gt;</button>
            <button class="tele-t" data-tool="line" title="Line" onclick="Telestrator.setTool('line')">/</button>
            <button class="tele-t" data-tool="circle" title="Circle" onclick="Telestrator.setTool('circle')">O</button>
            <button class="tele-t" data-tool="pen" title="Freehand" onclick="Telestrator.setTool('pen')">*</button>
          </div>
          <div class="tele-colors">${Telestrator.COLORS.map(c => `<button class="tele-c" data-color="${c}" style="background:${c}" onclick="Telestrator.setColor('${c}')"></button>`).join('')}</div>
          <button class="btn btn-sm btn-ghost" onclick="Telestrator.undo()">Undo</button>
          <button class="btn btn-sm btn-ghost" onclick="Telestrator.clear()">Clear</button>
          <button class="btn btn-sm btn-gold" onclick="Telestrator.snapshot()">📸 Snapshot</button>
          <button class="btn btn-sm btn-gold" id="clip-btn" onclick="Telestrator.captureClip()" title="Record a short GIF of this moment (plays the video)">🎞 Clip</button>
          <input id="clip-frames" type="number" min="${Telestrator.CLIP_MIN}" max="${Telestrator.CLIP_MAX}" value="${Telestrator.clipFrames()}" title="Number of frames to capture (${Telestrator.CLIP_MIN}-${Telestrator.CLIP_MAX})" style="width:52px;padding:.2rem .3rem;font-size:.74rem;text-align:center" onchange="Telestrator.setClipFrames(this.value)" oninput="Telestrator.setClipFrames(this.value)">
        </div>
        <div id="tele-gallery"></div>
        <div class="card mt">
          <div class="flex gap-sm center wrap">
            <button class="btn btn-primary btn-sm" onclick="Vods.capture()">*Capture timestamp</button>
            <input id="note-time" style="max-width:90px" placeholder="m:ss" value="0:00">
            <select id="note-tag" style="max-width:150px">${Object.entries(TAGS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
            <select id="note-sev" style="max-width:130px"><option value="0" selected>No severity</option><option value="1">Minor</option><option value="2">Moderate</option><option value="3">Major</option></select>
          </div>
          <div class="flex gap-sm mt-sm">
            <input id="note-text" placeholder="What happened / what to fix..." onkeydown="if(event.key==='Enter')Vods.addNote()">
            <button class="btn btn-primary" onclick="Vods.addNote()">Add note</button>
          </div>
          <div class="tmpl-row">
            <span class="muted" style="font-size:.72rem">Templates:</span>
            ${VOD_TEMPLATES.map(t => `<button class="mini-hero" onclick="Vods.applyTemplate('${UI.attr(t)}')">${UI.escape(t)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Notes <span class="muted" id="note-count" style="font-size:.8rem"></span></h2></div>
        <div class="note-list" id="note-list"></div>
        ${v.summary ? `<div class="divider"></div><div class="muted" style="font-size:.8rem"><b>Summary:</b> ${UI.escape(v.summary)}</div>` : ''}
      </div>
    </div>`;

  Vods.renderNotes();
  Vods.applyWidth();
  // Init the telestrator AFTER the player mounts -mountPlayer rewrites the
  // shell's innerHTML, which would otherwise wipe the canvas overlay.
  Vods.mountPlayer(v).then(() => { Vods.applyWidth(); if (typeof Telestrator !== 'undefined') Telestrator.init(v); });
};

/* -- Player abstraction ----------------------------------------------------- */
Vods._loadScript = (src) => new Promise((resolve, reject) => {
  if ([...document.scripts].some(s => s.src === src)) return resolve();
  const s = document.createElement('script');
  s.src = src; s.onload = resolve; s.onerror = reject;
  document.head.appendChild(s);
});
Vods._waitFor = (cond, ms = 8000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  (function poll() {
    if (cond()) return resolve();
    if (Date.now() - t0 > ms) return reject(new Error('timeout'));
    setTimeout(poll, 80);
  })();
});

Vods.destroyPlayer = function () {
  try { if (Vods.player && Vods.player.instance && Vods.player.instance.destroy) Vods.player.instance.destroy(); } catch (e) {}
  Vods.player = null;
  if (typeof Telestrator !== 'undefined') Telestrator.destroy();
};

Vods.mountPlayer = async function (v) {
  Vods.destroyPlayer();
  const shell = document.getElementById('player-shell');
  try {
    if (v.platform === 'youtube') {
      await Vods._loadScript('https://www.youtube.com/iframe_api');
      await Vods._waitFor(() => window.YT && window.YT.Player);
      shell.innerHTML = '<div id="yt-player"></div>';
      const inst = new YT.Player('yt-player', {
        videoId: v.videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: { onReady: () => { Vods.player.ready = true; } },
      });
      Vods.player = { type: 'youtube', instance: inst, ready: false,
        getTime: () => inst.getCurrentTime ? inst.getCurrentTime() : 0,
        play: () => { inst.playVideo && inst.playVideo(); },
        pause: () => { inst.pauseVideo && inst.pauseVideo(); },
        seek: (s) => { inst.seekTo(s, true); inst.playVideo && inst.playVideo(); } };
    } else if (v.platform === 'twitch') {
      await Vods._loadScript('https://player.twitch.tv/js/embed/v1.js');
      await Vods._waitFor(() => window.Twitch && window.Twitch.Player);
      shell.innerHTML = '<div id="twitch-embed" style="width:100%;height:100%"></div>';
      const inst = new Twitch.Player('twitch-embed', {
        video: v.videoId, parent: [location.hostname], width: '100%', height: '100%', autoplay: false,
      });
      Vods.player = { type: 'twitch', instance: inst, ready: true,
        getTime: () => inst.getCurrentTime ? inst.getCurrentTime() : 0,
        play: () => { inst.play && inst.play(); },
        pause: () => { inst.pause && inst.pause(); },
        seek: (s) => { inst.seek(s); inst.play && inst.play(); } };
    }
  } catch (e) {
    shell.innerHTML = `<div class="player-empty">Couldn't load the embedded player.<br><a href="${UI.escape(v.url)}" target="_blank">Open ${v.platform} in browser -&gt;</a><br><span style="font-size:.75rem">(You can still add notes by typing the timestamp manually.)</span></div>`;
  }
};

Vods.capture = function () {
  if (!Vods.player || !Vods.player.getTime) { UI.toast('Player not ready -type the time manually.', 'bad'); return; }
  const t = Vods.player.getTime() || 0;
  document.getElementById('note-time').value = UI.fmtTime(t);
  document.getElementById('note-text').focus();
};

Vods.seek = function (sec) {
  if (Vods.player && Vods.player.seek) Vods.player.seek(sec);
  else UI.toast('Player not loaded.', 'bad');
};

// Pre-fill the note box with a template prompt (and capture the current time).
Vods.applyTemplate = function (label) {
  const input = document.getElementById('note-text');
  input.value = label + ': ';
  if (Vods.player && Vods.player.getTime) document.getElementById('note-time').value = UI.fmtTime(Vods.player.getTime() || 0);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
};

/* -- VOD player width presets ----------------------------------------------- */
Vods.setWidth = function (w) {
  DB.settings ||= {}; DB.settings.vodWidth = String(w); saveDB();
  Vods.applyWidth();
  if (typeof Telestrator !== 'undefined' && Telestrator.resize) requestAnimationFrame(() => Telestrator.resize());
};
Vods.applyWidth = function () {
  const shell = document.getElementById('player-shell'); if (!shell) return;
  const w = (DB.settings || {}).vodWidth || '0';
  shell.style.maxWidth = (w && w !== '0') ? w + 'px' : '';
  shell.style.margin = (w && w !== '0') ? '0 auto' : '';
  document.querySelectorAll('[data-vw]').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.vw === w);
    b.classList.toggle('btn-ghost', b.dataset.vw !== w);
  });
};

/* -- Copy as Google Docs rich text (with embedded snapshots) --------------- */
Vods.copyGoogleDocs = function () {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  if (!v) return;
  const c = activeClient();
  const lines = [];
  lines.push(`<h2 style="font-family:Arial,sans-serif">VOD Review -${UI.escape(v.title)}</h2>`);
  lines.push(`<p style="font-family:Arial,sans-serif;color:#666;font-size:13px">${UI.escape(c ? c.name : '')} - ${UI.fmtDate(v.date)}${v.scenario ? ' - ' + UI.escape(v.scenario) : ''}</p>`);
  if (v.summary) lines.push(`<blockquote style="font-family:Arial,sans-serif;border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#444">${UI.escape(v.summary)}</blockquote>`);
  if (v.notes.length) {
    lines.push(`<h3 style="font-family:Arial,sans-serif">Notes</h3><ul>`);
    v.notes.forEach(n => {
      const tagLabel = TAGS[n.tag] ? ` [${TAGS[n.tag]}]` : '';
      lines.push(`<li style="font-family:Arial,sans-serif"><b>${UI.fmtTime(n.t)}</b>${tagLabel} -${UI.escape(n.text)}</li>`);
    });
    lines.push('</ul>');
  }
  if ((v.snapshots || []).length) {
    lines.push(`<h3 style="font-family:Arial,sans-serif">Snapshots</h3>`);
    v.snapshots.forEach(s => {
      lines.push(`<div style="margin:8px 0"><img src="${s.dataUrl}" style="max-width:480px;border-radius:4px;border:1px solid #ddd">${s.caption ? `<br><span style="font-family:Arial,sans-serif;font-size:12px;color:#666">${UI.escape(s.caption)}</span>` : ''}</div>`);
    });
  }
  const html = lines.join('\n');
  const plain = v.notes.map(n => `${UI.fmtTime(n.t)} -${n.text}`).join('\n');
  try {
    const blob = new Blob([html], { type: 'text/html' });
    const plainBlob = new Blob([plain], { type: 'text/plain' });
    const item = new ClipboardItem({ 'text/html': blob, 'text/plain': plainBlob });
    navigator.clipboard.write([item]).then(
      () => UI.toast('Copied -paste into Google Docs.', 'good'),
      () => { navigator.clipboard.writeText(plain).then(() => UI.toast('Rich copy blocked; plain text copied instead.', 'bad'), () => UI.toast('Clipboard blocked.', 'bad')); });
  } catch (e) {
    navigator.clipboard.writeText(plain).then(
      () => UI.toast('Copied as plain text (rich copy not available).'),
      () => UI.toast('Clipboard blocked -try again.', 'bad'));
  }
};

// Copy all notes as Markdown with clickable timestamp deep-links (for Discord).
Vods.copyMarkdown = function () {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  if (!v.notes.length) { UI.toast('No notes to copy.', 'bad'); return; }
  let md = `**VOD Review -${v.title}** (${UI.fmtDate(v.date)})\n<${v.url}>\n`;
  if (v.summary) md += `\n> ${v.summary}\n`;
  md += '\n';
  v.notes.forEach(n => {
    const tag = TAGS[n.tag] ? `\`${TAGS[n.tag]}\` ` : '';
    md += `- [${UI.fmtTime(n.t)}](${Vods.deepLink(v, n.t)}) ${tag}${n.text}\n`;
  });
  navigator.clipboard.writeText(md).then(
    () => UI.toast('Copied -paste into Discord.', 'good'),
    () => UI.toast('Clipboard blocked -try again.', 'bad'));
};

/* -- Notes ------------------------------------------------------------------ */
Vods.addNote = function () {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const text = document.getElementById('note-text').value.trim();
  const t = UI.parseTime(document.getElementById('note-time').value);
  if (!text) { UI.toast('Note text is required.', 'bad'); return; }
  if (t === null) { UI.toast('Invalid timestamp (use m:ss).', 'bad'); return; }
  const note = { id: uid(), t, text, tag: document.getElementById('note-tag').value, severity: parseInt(document.getElementById('note-sev').value) || 0 };
  // Insert in chronological position by default; manual drag order is preserved otherwise.
  let idx = v.notes.findIndex(n => n.t > t);
  if (idx < 0) idx = v.notes.length;
  v.notes.splice(idx, 0, note);
  saveDB();
  document.getElementById('note-text').value = '';
  Vods.renderNotes();
  UI.toast('Note added.', 'good');
};

Vods.editNote = function (noteId) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const n = v.notes.find(x => x.id === noteId);
  if (!n) return;
  UI.modal(`
    <div class="modal-head"><h2>Edit Note</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row">
      <label class="field"><span>Timestamp</span><input id="en-time" value="${UI.fmtTime(n.t)}"></label>
      <label class="field"><span>Type</span><select id="en-tag">${Object.entries(TAGS).map(([k, l]) => `<option value="${k}" ${n.tag === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Severity</span><select id="en-sev">
        <option value="0" ${!n.severity ? 'selected' : ''}>No severity</option>
        <option value="1" ${n.severity == 1 ? 'selected' : ''}>Minor</option>
        <option value="2" ${n.severity == 2 ? 'selected' : ''}>Moderate</option>
        <option value="3" ${n.severity == 3 ? 'selected' : ''}>Major</option>
      </select></label>
    </div>
    <label class="field"><span>Note</span><textarea id="en-text">${UI.escape(n.text)}</textarea></label>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="Vods.saveNoteEdit('${noteId}')">Save</button>
    </div>`);
};

Vods.saveNoteEdit = function (noteId) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const n = v.notes.find(x => x.id === noteId);
  if (!n) return;
  const t = UI.parseTime(document.getElementById('en-time').value);
  const text = document.getElementById('en-text').value.trim();
  if (!text) { UI.toast('Note text is required.', 'bad'); return; }
  if (t === null) { UI.toast('Invalid timestamp (use m:ss).', 'bad'); return; }
  n.t = t; n.text = text;
  n.tag = document.getElementById('en-tag').value;
  n.severity = parseInt(document.getElementById('en-sev').value) || 0;
  saveDB();
  UI.closeModal();
  Vods.renderNotes();
  UI.toast('Note updated.', 'good');
};

Vods.removeNote = function (noteId) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  v.notes = v.notes.filter(n => n.id !== noteId);
  saveDB();
  Vods.renderNotes();
};

Vods._dragNote = null;
Vods.dropNote = function (index) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const from = Vods._dragNote;
  Vods._dragNote = null;
  if (from === null || from === index) { Vods.renderNotes(); return; }
  const moved = v.notes.splice(from, 1)[0];
  v.notes.splice(index, 0, moved);
  saveDB();
  Vods.renderNotes();
};

Vods.renderNotes = function () {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const list = document.getElementById('note-list');
  document.getElementById('note-count').textContent = v.notes.length ? `(${v.notes.length})` : '';
  if (!v.notes.length) { list.innerHTML = '<div class="muted" style="font-size:.82rem;padding:1rem;text-align:center">No notes yet. Capture a timestamp while watching.</div>'; return; }
  list.innerHTML = v.notes.map((n, i) => `
    <div class="note-row" draggable="true"
      ondragstart="Vods._dragNote=${i}"
      ondragover="event.preventDefault();this.classList.add('drag-over')"
      ondragleave="this.classList.remove('drag-over')"
      ondrop="this.classList.remove('drag-over');Vods.dropNote(${i})">
      <span class="note-grip" title="Drag to reorder">::</span>
      <span class="ts" onclick="Vods.seek(${n.t})" title="Jump to ${UI.fmtTime(n.t)}">${UI.fmtTime(n.t)}</span>
      <div class="note-body">
        <div class="txt">${UI.escape(n.text)}</div>
        <div class="note-meta">
          ${n.severity ? `<span class="sev" style="background:${SEVERITY[n.severity]}"></span>` : ''}
          <span class="pill ${n.tag}">${TAGS[n.tag] || n.tag}</span>
        </div>
      </div>
      <div class="note-actions">
        <button class="btn btn-xs btn-ghost" title="Edit note" onclick="Vods.editNote('${n.id}')">*</button>
        <button class="btn btn-xs btn-ghost" title="Delete note" onclick="Vods.removeNote('${n.id}')">&times;</button>
      </div>
    </div>`).join('');
};


