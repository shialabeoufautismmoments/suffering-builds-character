/* =============================================================================
   FEEDBACK - private post-session ratings, issue triage, and separately
   permissioned testimonial quotes submitted through the client portal.
   ============================================================================= */
const Feedback = { filter: 'attention' };

Feedback.client = item => getClient(item.clientId) || { name: 'Former client' };
Feedback.session = item => (DB.sessions || []).find(session => session.id === item.sessionId) || null;
Feedback.isAttention = item => item.status !== 'resolved' && (item.priority === 'high' || item.issue || Number(item.rating) <= 2);
Feedback.stars = rating => `<span class="feedback-stars" aria-label="${rating} out of 5 stars">${'★'.repeat(Number(rating) || 0)}${'☆'.repeat(Math.max(0, 5 - Number(rating || 0)))}</span>`;
Feedback.items = function () {
  return (DB.feedback || []).slice().sort((a, b) =>
    Number(Feedback.isAttention(b)) - Number(Feedback.isAttention(a)) || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
  );
};

Feedback.visible = function () {
  return Feedback.items().filter(item => {
    if (Feedback.filter === 'all') return true;
    if (Feedback.filter === 'attention') return Feedback.isAttention(item);
    if (Feedback.filter === 'testimonial') return item.testimonialAllowed && item.publicQuote && !['Published', 'Declined'].includes(item.publicationStatus);
    return item.status === Feedback.filter;
  });
};

Feedback.alertHtml = function () {
  const alerts = Feedback.items().filter(Feedback.isAttention);
  if (!alerts.length) return '';
  const names = [...new Set(alerts.slice(0, 3).map(item => Feedback.client(item).name))];
  return `<div class="feedback-alert"><div><b>${alerts.length} feedback item${alerts.length === 1 ? '' : 's'} need follow-up</b><span>${UI.escape(names.join(', '))}${alerts.length > 3 ? ` and ${alerts.length - 3} more` : ''}</span></div><button class="btn btn-sm btn-primary" onclick="App.nav('feedback')">Open feedback</button></div>`;
};

UI.renderers.feedback = function (el) {
  const all = Feedback.items();
  const visible = Feedback.visible();
  const ratings = all.map(item => Number(item.rating)).filter(Boolean);
  const average = ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : '—';
  const attention = all.filter(Feedback.isAttention).length;
  const testimonialReady = all.filter(item => item.testimonialAllowed && item.publicQuote && !['Published', 'Declined'].includes(item.publicationStatus)).length;
  const filters = [['attention', 'Needs follow-up'], ['all', 'All'], ['new', 'New'], ['reviewing', 'Reviewing'], ['resolved', 'Resolved'], ['testimonial', 'Testimonial-ready']];
  el.innerHTML = `<div class="page-head"><div><div class="kicker">CLIENT EXPERIENCE</div><h1>Session Feedback</h1><div class="sub">Private coaching feedback, issue follow-up, and separately permissioned public quotes.</div></div></div>
    <div class="stat-tiles mb"><div class="stat-tile"><div class="label">Responses</div><div class="value">${all.length}</div></div><div class="stat-tile"><div class="label">Average rating</div><div class="value accent">${average}</div></div><div class="stat-tile"><div class="label">Needs follow-up</div><div class="value" style="color:${attention ? 'var(--bad)' : 'var(--good)'}">${attention}</div></div><div class="stat-tile"><div class="label">Testimonial-ready</div><div class="value">${testimonialReady}</div></div></div>
    <div class="feedback-toolbar" role="group" aria-label="Filter session feedback">${filters.map(([value, label]) => `<button class="btn btn-sm ${Feedback.filter === value ? 'btn-primary' : 'btn-ghost'}" onclick="Feedback.setFilter('${value}')">${label}</button>`).join('')}</div>
    <div class="feedback-inbox">${visible.length ? visible.map(Feedback.card).join('') : UI.emptyState('FEEDBACK', 'No feedback in this view', 'Completed-session feedback submitted by clients will appear here.')}</div>`;
};

Feedback.card = function (item) {
  const client = Feedback.client(item);
  const session = Feedback.session(item);
  const attention = Feedback.isAttention(item);
  return `<article class="feedback-card ${attention ? 'attention' : ''}">
    <div class="feedback-card-head"><div><h2>${UI.escape(client.name)}</h2><p>${session ? `${UI.fmtDate(session.date)}${session.topics ? ` · ${UI.escape(session.topics)}` : ''}` : 'Session no longer in workspace'}</p></div><div>${Feedback.stars(item.rating)}<span class="pill ${item.status === 'resolved' ? 'good' : attention ? 'mistake' : ''}">${item.status || 'new'}</span></div></div>
    ${item.privateNote ? `<section><span>Private feedback</span><p>${UI.escape(item.privateNote)}</p></section>` : ''}
    ${item.issue ? `<section class="feedback-issue"><span>Client requested follow-up</span><p>${UI.escape(item.issueDetails || 'No additional details supplied.')}</p></section>` : ''}
    ${item.testimonialAllowed ? `<section class="feedback-testimonial"><span>Public quote permission granted · ${UI.escape(item.publicationStatus || 'Not reviewed')}</span><blockquote>${UI.escape(item.publicQuote || 'Permission granted without a quote.')}</blockquote></section>` : '<p class="muted small">No testimonial permission granted.</p>'}
    ${item.coachResponse ? `<section><span>Response visible to client</span><p>${UI.escape(item.coachResponse)}</p></section>` : ''}
    <div class="feedback-card-foot"><span class="muted small">Updated ${UI.fmtDate((item.updatedAt || item.createdAt || '').slice(0, 10))}</span><div class="flex gap-sm">${item.testimonialAllowed && item.publicQuote ? `<button class="btn btn-xs btn-ghost" onclick="Feedback.copyQuote('${item.id}')">Copy quote</button>` : ''}<button class="btn btn-xs btn-primary" onclick="Feedback.edit('${item.id}')">Review</button></div></div>
  </article>`;
};

Feedback.setFilter = function (value) { Feedback.filter = value; UI.refresh(); };

Feedback.edit = function (id) {
  const item = (DB.feedback || []).find(feedback => feedback.id === id);
  if (!item) return;
  const client = Feedback.client(item);
  const publication = item.testimonialAllowed ? (item.publicationStatus || 'Not reviewed') : 'Permission not granted';
  UI.modal(`<div class="modal-head"><div><h2>Review feedback</h2><p class="muted">${UI.escape(client.name)} · ${Feedback.stars(item.rating)}</p></div><button class="close-x" onclick="UI.closeModal()">&times;</button></div>
    <div class="row"><label class="field"><span>Follow-up status</span><select id="fb-status">${[['new','New'],['reviewing','Reviewing'],['resolved','Resolved']].map(([value,label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span>Assigned coach</span><select id="fb-coachId"><option value="">Unassigned</option>${(DB.coaches || []).map(coach => `<option value="${coach.id}" ${item.coachId === coach.id ? 'selected' : ''}>${UI.escape(coach.name)}</option>`).join('')}</select></label></div>
    <label class="field"><span>Response to client</span><textarea id="fb-coachResponse" placeholder="This message appears in the client's Feedback tab.">${UI.escape(item.coachResponse || '')}</textarea></label>
    <label class="field"><span>Internal follow-up notes</span><textarea id="fb-coachNotes" placeholder="Private resolution notes, next action, or context.">${UI.escape(item.coachNotes || '')}</textarea></label>
    ${item.testimonialAllowed ? `<label class="field"><span>Public quote status</span><select id="fb-publicationStatus">${['Not reviewed','Approved','Published','Declined'].map(value => `<option ${publication === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><div class="notice"><b>Permissioned quote</b><p class="mt">${UI.escape(item.publicQuote || 'No quote supplied.')}</p></div>` : '<div class="notice">The client did not grant testimonial permission. Their private feedback must stay private.</div>'}
    <div class="modal-foot"><button class="btn btn-ghost" onclick="UI.closeModal()">Cancel</button><button class="btn btn-primary" onclick="Feedback.save('${id}')">Save review</button></div>`);
};

Feedback.save = function (id) {
  const item = (DB.feedback || []).find(feedback => feedback.id === id);
  if (!item) return;
  item.status = document.getElementById('fb-status').value;
  item.coachId = document.getElementById('fb-coachId').value;
  item.coachResponse = document.getElementById('fb-coachResponse').value.trim();
  item.coachNotes = document.getElementById('fb-coachNotes').value.trim();
  if (item.testimonialAllowed) item.publicationStatus = document.getElementById('fb-publicationStatus').value;
  item.updatedAt = new Date().toISOString();
  item.resolvedAt = item.status === 'resolved' ? item.updatedAt : '';
  saveDB();
  UI.closeModal();
  UI.toast('Feedback review saved.', 'good');
  UI.refresh();
};

Feedback.copyQuote = async function (id) {
  const item = (DB.feedback || []).find(feedback => feedback.id === id);
  if (!item?.testimonialAllowed || !item.publicQuote) return;
  try { await navigator.clipboard.writeText(item.publicQuote); UI.toast('Testimonial quote copied.', 'good'); }
  catch (error) { UI.toast('Could not copy the quote.', 'bad'); }
};
