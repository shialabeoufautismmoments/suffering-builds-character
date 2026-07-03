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

async function renderHallOfFame() {
  const grid = document.getElementById("fame-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "hallOfFame")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/players.json", { cache: "no-store" });
    const data = await res.json();
    const decorated = data.players.filter(p => p.achievements && p.achievements.length);

    if (!decorated.length) {
      grid.innerHTML = "<p>No achievements logged yet.</p>";
      return;
    }

    grid.innerHTML = decorated.map(p => `
      <a class="fame-card" style="--card-accent:${p.accent}" href="player.html?id=${encodeURIComponent(p.id)}">
        <div class="fame-card-header">
          ${avatarMarkup(p)}
          <div>
            <h3>${nameWithFlag(p)}</h3>
            <p class="role">${p.role} &middot; ${p.game}</p>
          </div>
        </div>
        <ul class="achievements-list">
          ${p.achievements.map(a => `<li>${a.achievement}</li>`).join("")}
        </ul>
      </a>
    `).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load the hall of fame right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderHallOfFame);
