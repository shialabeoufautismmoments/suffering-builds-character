/* =============================================================================
   TIMELINE -unified per-client activity stream (matches, sessions, VODs,
   playlists, stats imports). Used on the Dashboard and in reports.
   ============================================================================= */
const Timeline = {};

const TL_META = {
  match:    { color: 'var(--info)',   label: 'Match' },
  session:  { color: 'var(--accent)', label: 'Session' },
  vod:      { color: '#c678dd',       label: 'VOD' },
  playlist: { color: 'var(--good)',   label: 'Playlist' },
  stats:    { color: 'var(--warn)',   label: 'Stats' },
};

Timeline.build = function (clientId) {
  const ev = [];
  const dateOf = iso => (iso || '').slice(0, 10);

  clientMatches(clientId).forEach(m => ev.push({
    kind: 'match', date: dateOf(m.date) || dateOf(m.createdAt),
    text: `${m.result} on ${m.map || 'unknown map'}${m.heroes && m.heroes.length ? ' -' + m.heroes.join(', ') : ''}`,
    accent: m.result,
  }));
  clientSessions(clientId).forEach(s => ev.push({
    kind: 'session', date: dateOf(s.date) || dateOf(s.createdAt),
    text: `Coaching session${s.topics ? ' -' + s.topics : ''} (${s.durationMin || 0}m)`,
  }));
  clientVods(clientId).forEach(v => ev.push({
    kind: 'vod', date: dateOf(v.date) || dateOf(v.createdAt),
    text: `VOD review: ${v.title} (${v.notes.length} note${v.notes.length !== 1 ? 's' : ''})`,
  }));
  clientPlaylists(clientId).forEach(p => ev.push({
    kind: 'playlist', date: dateOf(p.createdAt),
    text: `Playlist assigned: ${p.name}`,
  }));
  const c = getClient(clientId);
  if (c && c.activity) {
    Object.keys(c.activity).forEach(d => {
      const iso = d.replace(/\./g, '-');
      ev.push({ kind: 'stats', date: iso, text: `${c.activity[d]} KovaaK's runs trained`, merge: true });
    });
  }

  // Collapse multiple stats-run entries on the same day already unique by date.
  return ev.filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date));
};

Timeline.html = function (clientId, limit = 12) {
  const ev = Timeline.build(clientId).slice(0, limit);
  if (!ev.length) return '<div class="muted" style="font-size:.82rem">No activity yet.</div>';
  const resultColor = { Win: 'var(--good)', Loss: 'var(--bad)', Draw: 'var(--text-muted)' };
  return `<div class="timeline">${ev.map(e => {
    const meta = TL_META[e.kind] || { color: '#888', label: '' };
    const dot = e.kind === 'match' && e.accent ? resultColor[e.accent] : meta.color;
    return `<div class="tl-item">
      <div class="tl-dot" style="background:${dot}"></div>
      <div class="tl-body">
        <div class="tl-text">${UI.escape(e.text)}</div>
        <div class="tl-meta"><span class="pill" style="border-color:${meta.color};color:${meta.color}">${meta.label}</span> <span class="muted">${UI.fmtDate(e.date)}</span></div>
      </div>
    </div>`;
  }).join('')}</div>`;
};


