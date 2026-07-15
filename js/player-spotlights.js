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

function avatarMarkup(name, photo) {
  return photo
    ? `<img class="player-avatar" src="${photo}" alt="${name}" />`
    : `<div class="player-avatar">${initials(name)}</div>`;
}

async function renderSpotlights() {
  const grid = document.getElementById("spotlights-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "spotlights")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/spotlights.json", { cache: "no-store" });
    const data = await res.json();
    const items = (data.spotlights || []).filter(s => s.enabled !== false);

    if (!items.length) {
      grid.innerHTML = "<p>No player spotlights yet.</p>";
      return;
    }

    grid.innerHTML = items.map(s => `
      <a class="staff-card" href="player-spotlight.html?slug=${encodeURIComponent(s.slug)}">
        <div class="staff-card-header">
          ${avatarMarkup(s.playerName, s.photo)}
          <div>
            <h3>${s.playerName}</h3>
          </div>
        </div>
        ${s.summary ? `<p class="staff-bio">${s.summary}</p>` : ""}
      </a>
    `).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load player spotlights right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderSpotlights);
