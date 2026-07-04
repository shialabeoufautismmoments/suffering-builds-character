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

async function renderStaff() {
  const grid = document.getElementById("staff-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "staff")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/players.json", { cache: "no-store" });
    const data = await res.json();
    const staff = data.players.filter(p => p.isStaff);

    if (!staff.length) {
      grid.innerHTML = "<p>No staff listed yet.</p>";
      return;
    }

    grid.innerHTML = staff.map(p => `
      <a class="staff-card" style="--card-accent:${p.accent}" href="player.html?id=${encodeURIComponent(p.id)}">
        <div class="staff-card-header">
          ${avatarMarkup(p)}
          <div>
            <h3>${nameWithFlag(p)}</h3>
            <p class="role">${p.role} &middot; ${p.game}</p>
          </div>
        </div>
        <p class="staff-bio">${p.bio}</p>
      </a>
    `).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load the staff list right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderStaff);
