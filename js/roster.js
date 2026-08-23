function initials(name) {
  return name
    .replace(/"[^"]*"/g, "")
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarMarkup(p) {
  return p.photo
    ? `<img class="player-avatar" src="${p.photo}" alt="${p.name}" />`
    : `<div class="player-avatar">${initials(p.name)}</div>`;
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return "";
  const points = [...code.toUpperCase()].map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...points);
}

function nameWithFlag(p) {
  const flag = flagEmoji(p.country);
  return flag ? `${p.name} <span class="flag" title="${p.country.toUpperCase()}">${flag}</span>` : p.name;
}

function validMemberCoachingDuos(duos, players, enabledCoachIds) {
  const playersById = new Map(players.map(player => [player.id, player]));
  const pairedCoachIds = new Set();

  return (duos || []).map(duo => {
    const first = playersById.get(duo.firstCoachId);
    const second = playersById.get(duo.secondCoachId);
    if (!first || !second || first.id === second.id ||
        !enabledCoachIds.has(first.id) || !enabledCoachIds.has(second.id)) {
      return null;
    }
    if (pairedCoachIds.has(first.id) || pairedCoachIds.has(second.id)) return null;
    pairedCoachIds.add(first.id);
    pairedCoachIds.add(second.id);
    return { first, second };
  }).filter(Boolean);
}

function duoPartnersByMember(duos) {
  const partners = new Map();
  duos.forEach(({ first, second }) => {
    partners.set(first.id, second);
    partners.set(second.id, first);
  });
  return partners;
}

function memberDuoProfileHtml(player) {
  return `
    <div class="coaching-duo-member" style="--card-accent:${player.accent}">
      ${avatarMarkup(player)}
      <div>
        <h3>${nameWithFlag(player)}</h3>
        <p class="role">${player.role} &middot; ${player.game}</p>
      </div>
    </div>
  `;
}

function renderMemberCoachingDuos(section, grid, duos) {
  if (!duos.length) {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }

  section.hidden = false;
  grid.innerHTML = duos.map(({ first, second }) => `
    <article class="coaching-duo-card">
      <div class="coaching-duo-kicker">COACHING DUO</div>
      <div class="coaching-duo-members">
        ${memberDuoProfileHtml(first)}
        <span class="coaching-duo-plus" aria-hidden="true">+</span>
        ${memberDuoProfileHtml(second)}
      </div>
      <div class="coaching-duo-actions">
        <a class="hero-button hero-button-secondary" href="player.html?id=${encodeURIComponent(first.id)}">View ${first.name}</a>
        <a class="hero-button hero-button-secondary" href="player.html?id=${encodeURIComponent(second.id)}">View ${second.name}</a>
      </div>
    </article>
  `).join("");
}

async function renderRoster() {
  const grid = document.getElementById("roster-grid");
  const duosSection = document.getElementById("member-duos-section");
  const duosGrid = document.getElementById("member-duos-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "roster")) {
    renderPageUnavailable(grid);
    duosSection.hidden = true;
    return;
  }
  try {
    const [playersRes, testimonialsData] = await Promise.all([
      fetch("data/players.json", { cache: "no-store" }),
      fetch("data/testimonials.json", { cache: "no-store" })
        .then(res => res.json())
        .catch(() => ({ coaches: [] }))
    ]);
    const data = await playersRes.json();
    const players = data.players || [];
    const enabledCoachIds = new Set((testimonialsData.coaches || [])
      .filter(coach => coach.enabled !== false)
      .map(coach => coach.playerId));
    const duos = validMemberCoachingDuos(data.coachingDuos || [], players, enabledCoachIds);
    const partners = duoPartnersByMember(duos);

    grid.innerHTML = players.map(p => `
      <a class="player-card" style="--card-accent:${p.accent}" href="player.html?id=${encodeURIComponent(p.id)}">
        ${avatarMarkup(p)}
        <h3>${nameWithFlag(p)}</h3>
        <p class="role">${p.role} &middot; ${p.game}</p>
        ${partners.has(p.id) ? `<p class="coach-duo-label">Coaching duo with ${nameWithFlag(partners.get(p.id))}</p>` : ""}
        <div class="meta-row">
          <span>Rank</span>
          <strong>${p.rank}</strong>
        </div>
      </a>
    `).join("");
    renderMemberCoachingDuos(duosSection, duosGrid, duos);
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load the roster right now.</p>";
    duosSection.hidden = true;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderRoster);
