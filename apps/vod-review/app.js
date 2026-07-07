const API = {
  tokenKey: 'coachsbc-hq-session-token',
  token: () => sessionStorage.getItem(API.tokenKey) || localStorage.getItem(API.tokenKey) || '',
  setToken: token => { sessionStorage.setItem(API.tokenKey, token); localStorage.setItem(API.tokenKey, token); },
  async unlock(password) {
    const response = await fetch('/api/coach-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Incorrect password.');
    API.setToken(result.token);
  },
  async workspaceGet() {
    const response = await fetch('/api/coach-workspace', { headers: { Authorization: `Bearer ${API.token()}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not load workspace.');
    return result.data || null;
  },
  async workspacePut(payload) {
    const response = await fetch('/api/coach-workspace', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API.token()}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 409) return { conflict: true, ...result };
    if (!response.ok) throw new Error(result.error || 'Could not save workspace.');
    return result;
  },
};

const State = {
  workspace: null,
  clientId: '',
  fileUrl: '',
  fileName: '',
  sourceUrl: '',
  tool: 'pen',
  color: '#e8833a',
  size: 5,
  zoom: 1,
  panX: 0,
  panY: 0,
  drawing: false,
  draft: null,
  strokes: [],
  markers: [],
};

const $ = id => document.getElementById(id);
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const fmtTime = sec => {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const toast = (message, type = '') => {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  $('toast-host').appendChild(el);
  setTimeout(() => el.remove(), 3200);
};

function renderLogin(error = '') {
  document.getElementById('app').innerHTML = `<div class="login">
    <form class="login-card" onsubmit="unlock(event)">
      <h1><span class="dot"></span>VOD Review Studio</h1>
      <p>Coach-only tool for drawing, clipping, screenshots, GIFs, and publishing reviews to the client app.</p>
      <label class="field"><span>Team password</span><input id="password" type="password" autocomplete="current-password" required autofocus></label>
      ${error ? `<p style="color:var(--bad)">${E(error)}</p>` : ''}
      <button class="btn btn-primary" id="unlock-btn">Unlock studio</button>
    </form>
  </div>`;
}

async function unlock(event) {
  event.preventDefault();
  const btn = $('unlock-btn');
  btn.disabled = true; btn.textContent = 'Unlocking...';
  try {
    await API.unlock($('password').value);
    await loadWorkspace();
    renderApp();
  } catch (e) {
    renderLogin(e.message || 'Could not unlock.');
  }
}

async function loadWorkspace() {
  State.workspace = await API.workspaceGet() || { clients: [], vods: [], cloud: { revision: 0 } };
  State.workspace.clients ||= [];
  State.workspace.vods ||= [];
  State.clientId ||= State.workspace.clients[0]?.id || '';
}

function renderApp() {
  const clients = State.workspace.clients.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  document.getElementById('app').innerHTML = `<div class="shell">
    <div class="topbar">
      <div class="brand"><span class="dot"></span>CoachSBC VOD Review Studio</div>
      <select id="client-select" onchange="State.clientId=this.value; refreshSide()" style="max-width:240px">${clients.map(c => `<option value="${c.id}" ${c.id === State.clientId ? 'selected' : ''}>${E(c.name)}</option>`).join('')}</select>
      <input id="review-title" placeholder="Review title" value="VOD Review - ${today()}" style="max-width:280px">
      <div class="spacer"></div>
      <span class="status" id="save-status">Workspace rev ${E(State.workspace.cloud?.revision || 0)}</span>
      <button class="btn btn-sm" onclick="loadWorkspace().then(()=>{toast('Workspace refreshed','good');renderApp();})">Refresh</button>
    </div>
    <div class="main">
      <section class="stage-col">
        ${toolbarHtml()}
        <div class="stage-wrap">
          <div class="stage" id="stage">
            <div class="media-plane" id="media-plane">
              <video id="video" controls playsinline></video>
              <canvas id="draw"></canvas>
            </div>
            <div class="empty-stage" id="empty-stage"><div><b>Load a local VOD file</b><br>Drawing screenshots/GIFs require a local video file or a CORS-enabled video source.</div></div>
          </div>
        </div>
        ${timelineHtml()}
      </section>
      <aside class="side" id="side"></aside>
    </div>
  </div>`;
  bindStage();
  refreshSide();
}

function toolbarHtml() {
  const tools = [['pen', 'Pen'], ['line', 'Line'], ['arrow', 'Arrow'], ['rect', 'Box'], ['circle', 'Circle'], ['text', 'Text'], ['erase', 'Clear']];
  return `<div class="toolbar">
    <label class="btn btn-sm">Load video <input type="file" accept="video/*" onchange="loadVideo(this.files[0])" style="display:none"></label>
    <input id="source-url" placeholder="Optional source URL / VOD link" onchange="State.sourceUrl=this.value.trim()" style="max-width:260px">
    ${tools.map(([id, label]) => `<button class="btn btn-sm ${State.tool === id ? 'on' : ''}" onclick="setTool('${id}')">${label}</button>`).join('')}
    <input class="color" type="color" value="${State.color}" onchange="State.color=this.value">
    <input class="number" type="number" min="1" max="40" value="${State.size}" onchange="State.size=+this.value||5" title="Brush size">
    <button class="btn btn-sm" onclick="undo()">Undo</button>
    <button class="btn btn-sm btn-danger" onclick="clearDrawings()">Clear drawings</button>
  </div>`;
}

function timelineHtml() {
  return `<div class="timeline-tools">
    <button class="btn btn-sm" onclick="seekBy(-5)">-5s</button>
    <button class="btn btn-sm" onclick="stepFrame(-1)">Prev frame</button>
    <button class="btn btn-sm" onclick="stepFrame(1)">Next frame</button>
    <button class="btn btn-sm" onclick="seekBy(5)">+5s</button>
    <label class="small muted">Zoom <input id="zoom" type="range" min="1" max="4" step=".05" value="${State.zoom}" oninput="setZoom(+this.value)" style="width:150px"></label>
    <button class="btn btn-sm" onclick="resetView()">Reset view</button>
    <button class="btn btn-sm btn-primary" onclick="addMarker()">+ Marker</button>
    <button class="btn btn-sm" onclick="captureScreenshot()">Screenshot</button>
    <button class="btn btn-sm" onclick="makeGif()">High-FPS GIF</button>
    <button class="btn btn-sm" onclick="makeClip()">Clip WebM</button>
  </div>`;
}

function refreshSide() {
  const c = State.workspace.clients.find(x => x.id === State.clientId);
  const bytes = reviewPayloadSize();
  $('side').innerHTML = `<div class="card">
    <div class="card-head"><h2>Publish review</h2><span class="pill">${E(c?.name || 'No client')}</span></div>
    <label class="field"><span>Summary for client</span><textarea id="summary" placeholder="Main takeaways, priorities, homework, next session focus..."></textarea></label>
    <div class="small muted mb">Payload estimate: ${Math.round(bytes / 1024)} KB. Keep under ~3.5 MB for reliable sync.</div>
    <button class="btn btn-primary" onclick="publishReview()">Send Review to Client App</button>
  </div>
  <div class="card">
    <div class="card-head"><h2>Capture settings</h2></div>
    <div class="row"><label class="field"><span>GIF FPS</span><input id="gif-fps" type="number" min="5" max="30" value="20"></label><label class="field"><span>GIF seconds</span><input id="gif-seconds" type="number" min="1" max="8" value="3"></label></div>
    <div class="row"><label class="field"><span>Clip seconds</span><input id="clip-seconds" type="number" min="1" max="20" value="6"></label><label class="field"><span>Output width</span><input id="out-width" type="number" min="320" max="1280" value="720"></label></div>
    <p class="muted small">GIFs include the current zoom and drawings. High FPS/long GIFs get large fast.</p>
  </div>
  <div class="card">
    <div class="card-head"><h2>Markers</h2><span class="pill">${State.markers.length}</span></div>
    <div id="markers">${State.markers.length ? State.markers.map(markerHtml).join('') : '<p class="muted small">Add a marker at a teachable moment, then attach screenshots/GIFs/clips.</p>'}</div>
  </div>`;
}

function markerHtml(m) {
  return `<div class="marker">
    <div class="flex between center gap"><button class="btn btn-sm" onclick="goTo(${m.time})">${fmtTime(m.time)}</button><button class="btn btn-sm btn-danger" onclick="removeMarker('${m.id}')">Remove</button></div>
    <label class="field mt"><span>Title</span><input value="${E(m.title)}" onchange="updateMarker('${m.id}','title',this.value)"></label>
    <div class="row"><label class="field"><span>Tag</span><select onchange="updateMarker('${m.id}','tag',this.value)">${['Mistake','Good play','Drill','Decision','Positioning','Mechanics','Other'].map(x => `<option ${m.tag === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label class="field"><span>Severity</span><select onchange="updateMarker('${m.id}','severity',this.value)">${['Low','Medium','High','Key'].map(x => `<option ${m.severity === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    <label class="field"><span>Coach note</span><textarea onchange="updateMarker('${m.id}','note',this.value)">${E(m.note)}</textarea></label>
    ${m.imageDataUrl ? `<img src="${m.imageDataUrl}" alt="Screenshot">` : ''}
    ${m.gifDataUrl ? `<img src="${m.gifDataUrl}" alt="GIF">` : ''}
    ${m.clipDataUrl ? `<video src="${m.clipDataUrl}" controls></video>` : ''}
  </div>`;
}

function bindStage() {
  const video = $('video'), canvas = $('draw'), stage = $('stage');
  const resize = () => {
    const rect = stage.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    redraw();
  };
  new ResizeObserver(resize).observe(stage);
  video.addEventListener('loadedmetadata', resize);
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);
  stage.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(Math.max(1, Math.min(4, State.zoom + (e.deltaY > 0 ? -.1 : .1))));
    $('zoom').value = State.zoom;
  }, { passive: false });
  applyTransform();
}

function loadVideo(file) {
  if (!file) return;
  if (State.fileUrl) URL.revokeObjectURL(State.fileUrl);
  State.fileUrl = URL.createObjectURL(file);
  State.fileName = file.name;
  $('video').src = State.fileUrl;
  $('empty-stage').style.display = 'none';
  toast('Video loaded. Draw on top, then capture moments.', 'good');
}
function setTool(tool) {
  if (tool === 'erase') return clearDrawings();
  State.tool = tool;
  renderApp();
}
function setZoom(z) { State.zoom = z; applyTransform(); }
function resetView() { State.zoom = 1; State.panX = 0; State.panY = 0; $('zoom').value = 1; applyTransform(); }
function applyTransform() { const p = $('media-plane'); if (p) p.style.transform = `translate(${State.panX}px,${State.panY}px) scale(${State.zoom})`; }
function seekBy(sec) { const v = $('video'); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec)); }
function stepFrame(dir) { seekBy(dir / 60); }
function goTo(sec) { $('video').currentTime = Math.max(0, sec || 0); }

function localPoint(e) {
  const canvas = $('draw'), rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const x = (e.clientX - rect.left - cx - State.panX) / State.zoom + cx;
  const y = (e.clientY - rect.top - cy - State.panY) / State.zoom + cy;
  return { x: x * devicePixelRatio, y: y * devicePixelRatio };
}
function pointerDown(e) {
  if (e.button !== 0) return;
  const p = localPoint(e);
  State.drawing = true;
  if (State.tool === 'text') {
    const text = prompt('Text label:');
    if (text) State.strokes.push({ id: uid(), tool: 'text', color: State.color, size: State.size, points: [p], text });
    State.drawing = false; redraw(); return;
  }
  State.draft = { id: uid(), tool: State.tool, color: State.color, size: State.size, points: [p] };
}
function pointerMove(e) {
  if (!State.drawing || !State.draft) return;
  const p = localPoint(e);
  if (State.draft.tool === 'pen') State.draft.points.push(p);
  else State.draft.points[1] = p;
  redraw(State.draft);
}
function pointerUp() {
  if (!State.drawing || !State.draft) return;
  State.strokes.push(State.draft);
  State.drawing = false;
  State.draft = null;
  redraw();
}
function undo() { State.strokes.pop(); redraw(); }
function clearDrawings() { State.strokes = []; redraw(); }
function redraw(extra) {
  const canvas = $('draw'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  State.strokes.concat(extra ? [extra] : []).forEach(s => drawStroke(ctx, s));
}
function drawStroke(ctx, s) {
  ctx.save();
  ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.size * devicePixelRatio; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = s.points || [];
  if (!pts.length) return ctx.restore();
  if (s.tool === 'pen') {
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  } else if (['line', 'arrow'].includes(s.tool) && pts[1]) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
    if (s.tool === 'arrow') drawArrowHead(ctx, pts[0], pts[1], s.size * devicePixelRatio);
  } else if (s.tool === 'rect' && pts[1]) {
    ctx.strokeRect(pts[0].x, pts[0].y, pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  } else if (s.tool === 'circle' && pts[1]) {
    const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2); ctx.stroke();
  } else if (s.tool === 'text') {
    ctx.font = `${Math.max(16, s.size * 5) * devicePixelRatio}px Segoe UI`;
    ctx.fillText(s.text || '', pts[0].x, pts[0].y);
  }
  ctx.restore();
}
function drawArrowHead(ctx, a, b, size) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x), len = Math.max(12, size * 3);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - len * Math.cos(angle - Math.PI / 6), b.y - len * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(b.x - len * Math.cos(angle + Math.PI / 6), b.y - len * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function drawComposite(width = 1280) {
  const video = $('video'), overlay = $('draw'), stage = $('stage');
  if (!video.src) throw new Error('Load a video first.');
  const rect = stage.getBoundingClientRect();
  const out = document.createElement('canvas');
  out.width = width;
  out.height = Math.round(width * rect.height / rect.width);
  const ctx = out.getContext('2d');
  const scale = out.width / rect.width;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.translate((rect.width / 2 + State.panX) * scale, (rect.height / 2 + State.panY) * scale);
  ctx.scale(State.zoom * scale, State.zoom * scale);
  ctx.translate(-rect.width / 2, -rect.height / 2);
  ctx.drawImage(video, 0, 0, rect.width, rect.height);
  ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, rect.width, rect.height);
  ctx.restore();
  return out;
}
function currentMarker() {
  const t = $('video').currentTime || 0;
  return State.markers.slice().sort((a, b) => Math.abs(a.time - t) - Math.abs(b.time - t))[0] || addMarker(true);
}
function addMarker(silent = false) {
  const v = $('video');
  const marker = { id: uid(), time: v.currentTime || 0, title: `Moment ${State.markers.length + 1}`, tag: 'Mistake', severity: 'Medium', note: '', createdAt: new Date().toISOString() };
  State.markers.push(marker);
  if (!silent) { toast('Marker added.', 'good'); refreshSide(); }
  return marker;
}
function updateMarker(id, key, value) { const m = State.markers.find(x => x.id === id); if (m) m[key] = value; }
function removeMarker(id) { State.markers = State.markers.filter(x => x.id !== id); refreshSide(); }
function captureScreenshot() {
  try {
    const width = Math.max(320, Math.min(1280, +$('out-width')?.value || 960));
    currentMarker().imageDataUrl = drawComposite(width).toDataURL('image/jpeg', .86);
    toast('Screenshot attached to nearest marker.', 'good');
    refreshSide();
  } catch (e) { toast(e.message, 'bad'); }
}
async function makeGif() {
  const video = $('video');
  if (!video.src) return toast('Load a video first.', 'bad');
  if (typeof GIF === 'undefined') return toast('GIF encoder did not load.', 'bad');
  const fps = Math.max(5, Math.min(30, +$('gif-fps').value || 20));
  const seconds = Math.max(1, Math.min(8, +$('gif-seconds').value || 3));
  const width = Math.max(320, Math.min(960, +$('out-width').value || 640));
  const start = video.currentTime;
  const frames = Math.min(180, Math.round(fps * seconds));
  const gif = new GIF({ workers: 2, quality: 8, workerScript: 'gif.worker.js', width, height: Math.round(width * 9 / 16) });
  toast(`Rendering ${frames} GIF frames...`);
  const wasPaused = video.paused; video.pause();
  for (let i = 0; i < frames; i++) {
    await seekTo(Math.min(video.duration || start, start + i / fps));
    gif.addFrame(drawComposite(width).getContext('2d'), { copy: true, delay: 1000 / fps });
  }
  await seekTo(start); if (!wasPaused) video.play();
  gif.on('finished', blob => {
    const reader = new FileReader();
    reader.onload = () => {
      currentMarker().gifDataUrl = reader.result;
      toast('GIF attached to nearest marker.', 'good');
      refreshSide();
    };
    reader.readAsDataURL(blob);
  });
  gif.render();
}
function seekTo(time) {
  const video = $('video');
  return new Promise(resolve => {
    const done = () => { video.removeEventListener('seeked', done); setTimeout(resolve, 20); };
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}
async function makeClip() {
  const video = $('video');
  if (!video.src) return toast('Load a video first.', 'bad');
  const seconds = Math.max(1, Math.min(20, +$('clip-seconds').value || 6));
  const width = Math.max(320, Math.min(1280, +$('out-width').value || 720));
  const canvas = drawComposite(width);
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const reader = new FileReader();
    reader.onload = () => { currentMarker().clipDataUrl = reader.result; toast('WebM clip attached.', 'good'); refreshSide(); };
    reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
  };
  const start = video.currentTime, end = Math.min(video.duration || start + seconds, start + seconds);
  recorder.start();
  const timer = setInterval(() => {
    const frame = drawComposite(width);
    canvas.getContext('2d').drawImage(frame, 0, 0, canvas.width, canvas.height);
    if (video.currentTime >= end) { clearInterval(timer); recorder.stop(); video.pause(); video.currentTime = start; }
  }, 1000 / 30);
  video.play();
}

function reviewPayloadSize() {
  const payload = { markers: State.markers, summary: $('summary')?.value || '' };
  return new Blob([JSON.stringify(payload)]).size;
}
async function publishReview() {
  const clientId = State.clientId;
  if (!clientId) return toast('Choose a client first.', 'bad');
  const bytes = reviewPayloadSize();
  if (bytes > 3_600_000 && !confirm(`This review is about ${Math.round(bytes / 1024)} KB and may be too large to sync. Publish anyway?`)) return;
  const makeVod = workspace => {
    workspace.vods ||= [];
    const vod = {
      id: uid(),
      clientId,
      title: $('review-title').value.trim() || `VOD Review - ${today()}`,
      reviewStatus: 'complete',
      platform: 'vod-review-web',
      url: State.sourceUrl || $('source-url')?.value.trim() || '',
      date: today(),
      scenario: State.fileName || 'CoachSBC VOD Review Studio',
      summary: $('summary').value.trim(),
      notes: State.markers.map(m => ({
        id: m.id, t: Math.round(m.time || 0), text: m.note || m.title, tag: m.tag, severity: m.severity,
        title: m.title, imageDataUrl: m.imageDataUrl || '', gifDataUrl: m.gifDataUrl || '', clipDataUrl: m.clipDataUrl || '',
        createdAt: m.createdAt || new Date().toISOString(),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'vod-review-web',
    };
    workspace.vods.push(vod);
    return workspace;
  };
  try {
    $('save-status').textContent = 'Publishing...';
    let base = Number(State.workspace.cloud?.revision || 0);
    let next = makeVod(structuredClone(State.workspace));
    let result = await API.workspacePut({ data: next, baseRevision: base });
    if (result.conflict && result.data) {
      next = makeVod(result.data);
      result = await API.workspacePut({ data: next, baseRevision: Number(result.data.cloud?.revision || 0) });
    }
    if (!result.data) throw new Error(result.error || 'Could not publish review.');
    State.workspace = result.data;
    State.markers = [];
    toast('Review sent to the client app.', 'good');
    renderApp();
  } catch (e) {
    $('save-status').textContent = 'Publish failed';
    toast(e.message || 'Publish failed.', 'bad');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (API.token()) loadWorkspace().then(renderApp).catch(() => renderLogin());
  else renderLogin();
});
