/* =============================================================================
   TELESTRATOR -draw arrows / circles / lines over a paused VOD frame, and
   snapshot the composited result (video frame + drawings) to the VOD.
   ============================================================================= */
const Telestrator = {};

Telestrator.COLORS = ['#ff5252', '#ffd54f', '#4fc3f7', '#69f0ae', '#ffffff'];
Telestrator.shapes = [];
Telestrator.tool = 'arrow';
Telestrator.color = '#ff5252';
Telestrator.active = false;
Telestrator._draft = null;

Telestrator.init = function (vod) {
  Telestrator.shapes = [];
  Telestrator._draft = null;
  Telestrator.active = false;
  const shell = document.getElementById('player-shell');
  if (!shell) return;
  let cv = document.getElementById('tele-canvas');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'tele-canvas'; cv.className = 'tele-canvas'; shell.appendChild(cv); }
  // Explicit inline styles so the overlay reliably sits above the cross-origin iframe.
  Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '50', pointerEvents: 'none' });
  Telestrator._canvas = cv;
  Telestrator._ctx = cv.getContext('2d');
  Telestrator.bind();
  requestAnimationFrame(() => Telestrator.resize());
  Telestrator.renderGallery(vod);
  Telestrator.updateBar();
};

Telestrator.destroy = function () {
  if (Telestrator._onResize) { window.removeEventListener('resize', Telestrator._onResize); Telestrator._onResize = null; }
};

Telestrator.resize = function () {
  const cv = Telestrator._canvas; if (!cv) return;
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  cv.width = Math.round(r.width); cv.height = Math.round(r.height);
  Telestrator.redraw();
};

Telestrator.setTool = function (t) { Telestrator.tool = t; if (!Telestrator.active) Telestrator.toggle(); Telestrator.updateBar(); };
Telestrator.setColor = function (c) { Telestrator.color = c; Telestrator.updateBar(); };

Telestrator.toggle = function () {
  Telestrator.active = !Telestrator.active;
  const cv = Telestrator._canvas;
  if (cv) {
    cv.classList.toggle('drawing', Telestrator.active);
    cv.style.pointerEvents = Telestrator.active ? 'auto' : 'none';
    cv.style.cursor = Telestrator.active ? 'crosshair' : 'default';
    cv.style.background = Telestrator.active ? 'rgba(255,255,255,0.04)' : 'transparent';
    Telestrator.resize();
  }
  Telestrator.updateBar();
};

Telestrator.updateBar = function () {
  const bar = document.getElementById('tele-bar'); if (!bar) return;
  bar.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', Telestrator.active && b.dataset.tool === Telestrator.tool));
  bar.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color === Telestrator.color));
  const tg = document.getElementById('tele-toggle');
  if (tg) { tg.classList.toggle('btn-primary', Telestrator.active); tg.innerHTML = Telestrator.active ? '*Drawing -ON' : '*Draw'; }
};

Telestrator._pos = function (e) {
  const r = Telestrator._canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

Telestrator.bind = function () {
  const cv = Telestrator._canvas;
  cv.onmousedown = (e) => {
    if (!Telestrator.active) return;
    if (cv.width !== Math.round(cv.getBoundingClientRect().width)) Telestrator.resize();
    const p = Telestrator._pos(e);
    Telestrator._draft = { tool: Telestrator.tool, color: Telestrator.color, a: p, b: p, points: [p] };
  };
  cv.onmousemove = (e) => {
    if (!Telestrator._draft) return;
    const p = Telestrator._pos(e);
    Telestrator._draft.b = p;
    if (Telestrator._draft.tool === 'pen') Telestrator._draft.points.push(p);
    Telestrator.redraw(Telestrator._draft);
  };
  const finish = () => { if (Telestrator._draft) { Telestrator.shapes.push(Telestrator._draft); Telestrator._draft = null; Telestrator.redraw(); } };
  cv.onmouseup = finish;
  cv.onmouseleave = finish;
  if (Telestrator._onResize) window.removeEventListener('resize', Telestrator._onResize);
  Telestrator._onResize = () => Telestrator.resize();
  window.addEventListener('resize', Telestrator._onResize);
};

Telestrator.drawShape = function (ctx, s) {
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.tool === 'pen') {
    ctx.beginPath(); s.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  } else if (s.tool === 'line') {
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
  } else if (s.tool === 'circle') {
    const cx = (s.a.x + s.b.x) / 2, cy = (s.a.y + s.b.y) / 2, rx = Math.abs(s.b.x - s.a.x) / 2, ry = Math.abs(s.b.y - s.a.y) / 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx || 1, ry || 1, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (s.tool === 'arrow') {
    ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
    const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x), h = 16;
    ctx.beginPath(); ctx.moveTo(s.b.x, s.b.y);
    ctx.lineTo(s.b.x - h * Math.cos(ang - Math.PI / 7), s.b.y - h * Math.sin(ang - Math.PI / 7));
    ctx.lineTo(s.b.x - h * Math.cos(ang + Math.PI / 7), s.b.y - h * Math.sin(ang + Math.PI / 7));
    ctx.closePath(); ctx.fill();
  }
};

Telestrator.redraw = function (draft) {
  const ctx = Telestrator._ctx, cv = Telestrator._canvas; if (!ctx) return;
  ctx.clearRect(0, 0, cv.width, cv.height);
  Telestrator.shapes.forEach(s => Telestrator.drawShape(ctx, s));
  if (draft) Telestrator.drawShape(ctx, draft);
};

Telestrator.undo = function () { Telestrator.shapes.pop(); Telestrator.redraw(); };
Telestrator.clear = function () { Telestrator.shapes = []; Telestrator.redraw(); };

Telestrator.snapshot = async function () {
  const shell = document.getElementById('player-shell');
  if (!shell) return;
  const r = shell.getBoundingClientRect();
  UI.toast('Capturing frame...');
  const res = await window.api.captureRegion({ x: r.left, y: r.top, width: r.width, height: r.height });
  if (!res || !res.success) { UI.toast('Capture failed: ' + ((res && res.msg) || ''), 'bad'); return; }
  const v = DB.vods.find(x => x.id === Vods.viewing);
  (v.snapshots ||= []).push({
    id: uid(), dataUrl: res.dataUrl,
    t: (Vods.player && Vods.player.getTime) ? Math.floor(Vods.player.getTime() || 0) : 0,
    caption: '', createdAt: new Date().toISOString(),
  });
  saveDB();
  Telestrator.renderGallery(v);
  UI.toast('Snapshot saved to this VOD.', 'good');
};

Telestrator.renderGallery = function (v) {
  const g = document.getElementById('tele-gallery'); if (!g) return;
  const snaps = v.snapshots || [], clips = v.clips || [];
  let html = '';
  if (snaps.length) html += `<div class="card-head" style="margin-top:.6rem"><h2 style="font-size:.92rem">Snapshots (${snaps.length})</h2>
      <span class="muted" style="font-size:.74rem">Included in the PDF report & client portal</span></div>
    <div class="snap-grid">${snaps.map(s => `
      <div class="snap">
        <img src="${s.dataUrl}" title="${UI.fmtTime(s.t)}" onclick="Telestrator.viewSnap('${s.id}')">
        <input class="snap-cap" value="${UI.escape(s.caption || '')}" placeholder="caption..." onblur="Telestrator.caption('${s.id}', this.value)">
        <button class="snap-del" title="Delete snapshot" onclick="Telestrator.delSnap('${s.id}')">x</button>
      </div>`).join('')}</div>`;
  if (clips.length) html += `<div class="card-head" style="margin-top:.7rem"><h2 style="font-size:.92rem">Clips (${clips.length})</h2>
      <span class="muted" style="font-size:.74rem">Animated GIF - a filmstrip goes in the PDF</span></div>
    <div class="snap-grid">${clips.map(c => `
      <div class="snap">
        <img src="${c.gif}" title="${UI.fmtTime(c.t)}" onclick="Telestrator.viewClip('${c.id}')">
        <input class="snap-cap" value="${UI.escape(c.caption || '')}" placeholder="caption..." onblur="Telestrator.clipCaption('${c.id}', this.value)">
        <button class="snap-del" title="Delete clip" onclick="Telestrator.delClip('${c.id}')">x</button>
      </div>`).join('')}</div>`;
  g.innerHTML = html;
};

/* -- Clips (animated GIF of a moment) --------------------------------------- */
Telestrator.CLIP_MIN = 20;
Telestrator.CLIP_MAX = 150;
Telestrator.clipFrames = function () {
  const n = parseInt((DB.settings || {}).clipFrames, 10) || 40;
  return Math.max(Telestrator.CLIP_MIN, Math.min(Telestrator.CLIP_MAX, n));
};
Telestrator.setClipFrames = function (v) {
  const n = Math.max(Telestrator.CLIP_MIN, Math.min(Telestrator.CLIP_MAX, parseInt(v, 10) || 40));
  DB.settings ||= {}; DB.settings.clipFrames = n; saveDB();
};

Telestrator.captureClip = async function () {
  const shell = document.getElementById('player-shell');
  if (!shell) return;
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const t = (Vods.player && Vods.player.getTime) ? Math.floor(Vods.player.getTime() || 0) : 0;
  const frameCount = Telestrator.clipFrames();
  const btn = document.getElementById('clip-btn');
  const toastHost = document.getElementById('toast-host');
  const prevVis = toastHost ? toastHost.style.visibility : '';
  if (toastHost) toastHost.style.visibility = 'hidden';
  if (Vods.player && Vods.player.play) Vods.player.play();
  const r0 = shell.getBoundingClientRect();
  const rect = { x: r0.left, y: r0.top, width: r0.width, height: r0.height };
  const shots = [];
  const t0 = Date.now();
  for (let i = 0; i < frameCount; i++) {
    if (btn) btn.textContent = `*REC ${i + 1}/${frameCount}`;
    const res = await window.api.captureRegion(rect);
    if (res && res.success) shots.push(res.dataUrl);
  }
  const elapsed = Math.max(1, Date.now() - t0);
  if (Vods.player && Vods.player.pause) Vods.player.pause();
  if (toastHost) toastHost.style.visibility = prevVis;
  if (btn) btn.textContent = '🎞 Clip';
  if (!shots.length) { UI.toast('Capture failed.', 'bad'); return; }
  UI.toast('Encoding GIF...');
  try {
    const delay = Math.max(20, Math.round(elapsed / shots.length));
    const gif = await Telestrator.encodeGif(shots, delay);
    const stills = []; const step = Math.max(1, Math.floor(shots.length / 5));
    for (let i = 0; i < shots.length && stills.length < 5; i += step) stills.push(shots[i]);
    if (stills[stills.length - 1] !== shots[shots.length - 1]) stills.push(shots[shots.length - 1]);
    (v.clips ||= []).push({ id: uid(), t, caption: '', gif, stills: stills.slice(0, 6), createdAt: new Date().toISOString() });
    saveDB();
    Telestrator.renderGallery(v);
    UI.toast('Clip saved to this VOD.', 'good');
  } catch (e) { UI.toast('GIF encode failed: ' + e.message, 'bad'); }
};

Telestrator.encodeGif = function (frameUrls, delay) {
  return new Promise((resolve, reject) => {
    if (typeof GIF === 'undefined') return reject(new Error('GIF encoder not loaded'));
    Promise.all(frameUrls.map(du => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = du; })))
      .then(imgs => {
        const scale = Math.min(1, 480 / imgs[0].width);
        const w = Math.max(1, Math.round(imgs[0].width * scale)), h = Math.max(1, Math.round(imgs[0].height * scale));
        const gif = new GIF({ workers: 2, quality: 12, width: w, height: h, workerScript: 'js/gif.worker.js' });
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        imgs.forEach(im => { ctx.clearRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h); gif.addFrame(ctx, { copy: true, delay }); });
        gif.on('finished', blob => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
        gif.on('abort', () => reject(new Error('encoding aborted')));
        gif.render();
      }).catch(reject);
  });
};

Telestrator.clipCaption = function (id, val) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const c = (v.clips || []).find(x => x.id === id);
  if (c) { c.caption = val.trim(); saveDB(); }
};
Telestrator.delClip = function (id) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  v.clips = (v.clips || []).filter(x => x.id !== id);
  saveDB(); Telestrator.renderGallery(v);
};
Telestrator.viewClip = function (id) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const c = (v.clips || []).find(x => x.id === id);
  if (!c) return;
  UI.modal(`
    <div class="modal-head"><h2>Clip - ${UI.fmtTime(c.t)}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <img src="${c.gif}" style="width:100%;border-radius:8px;border:1px solid var(--border)">
    ${c.caption ? `<p class="muted mt-sm">${UI.escape(c.caption)}</p>` : ''}
    <div class="modal-foot">
      <button class="btn" onclick="window.api.saveFile('mistake-${c.t}s.gif', '${c.gif}').then(r=>UI.toast(r.success?'GIF saved.':r.msg, r.success?'good':'bad'))">Save GIF</button>
      <button class="btn" onclick="Discord.post('${v.clientId}', '', '${c.gif}')">📨 Post to Discord</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Close</button>
    </div>`, { wide: true });
};

Telestrator.caption = function (id, val) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const s = (v.snapshots || []).find(x => x.id === id);
  if (s) { s.caption = val.trim(); saveDB(); }
};
Telestrator.delSnap = function (id) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  v.snapshots = (v.snapshots || []).filter(x => x.id !== id);
  saveDB();
  Telestrator.renderGallery(v);
};
Telestrator.viewSnap = function (id) {
  const v = DB.vods.find(x => x.id === Vods.viewing);
  const s = (v.snapshots || []).find(x => x.id === id);
  if (!s) return;
  UI.modal(`
    <div class="modal-head"><h2>Snapshot - ${UI.fmtTime(s.t)}</h2><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <img src="${s.dataUrl}" style="width:100%;border-radius:8px;border:1px solid var(--border)">
    ${s.caption ? `<p class="muted mt-sm">${UI.escape(s.caption)}</p>` : ''}
    <div class="modal-foot">
      <button class="btn" onclick="window.api.copyImage(document.querySelector('#modal img').src).then(()=>UI.toast('Image copied to clipboard.','good'))">Copy image</button>
      <button class="btn btn-ghost" onclick="UI.closeModal()">Close</button>
    </div>`, { wide: true });
};


