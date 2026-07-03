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

async function renderRoster() {
  const grid = document.getElementById("roster-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "roster")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/players.json", { cache: "no-store" });
    const data = await res.json();
    grid.innerHTML = data.players.map(p => `
      <a class="player-card" style="--card-accent:${p.accent}" href="player.html?id=${encodeURIComponent(p.id)}">
        ${avatarMarkup(p)}
        <h3>${p.name}</h3>
        <p class="role">${p.role} &middot; ${p.game}</p>
        <div class="meta-row">
          <span>Rank</span>
          <strong>${p.rank}</strong>
        </div>
      </a>
    `).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load the roster right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderRoster);
