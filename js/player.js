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

function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

function achievementLines(text) {
  return (text || "").split("\n").map(a => a.trim()).filter(Boolean);
}

function youtubeIdFromUrl(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  return match ? match[1] : null;
}

function videosHtml(text) {
  const urls = (text || "").split("\n").map(u => u.trim()).filter(Boolean);
  if (!urls.length) return "";

  const embeds = urls.map(url => {
    const id = youtubeIdFromUrl(url);
    return id
      ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
      : `<p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
  }).join("");

  return `
    <h4 style="margin-top:24px">Videos</h4>
    ${embeds}
  `;
}

function avatarMarkup(p, extraClass) {
  const cls = `player-avatar${extraClass ? " " + extraClass : ""}`;
  return p.photo
    ? `<img class="${cls}" src="${p.photo}" alt="${p.name}" />`
    : `<div class="${cls}" style="background:${p.accent}">${initials(p.name)}</div>`;
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

function socialLinksHtml(player) {
  const labels = { twitch: "Twitch", twitter: "Twitter", pyvno: "Pyvno" };
  const links = Object.entries(player.socials || {})
    .filter(([, url]) => url)
    .map(([key, url]) => `<a href="${url}" target="_blank" rel="noopener">${labels[key] || key}</a>`);

  if (!links.length) return "";

  return `
    <div class="sidebar-box">
      <h4 style="margin-bottom:12px">Links</h4>
      <div class="social-links">${links.join("")}</div>
    </div>
  `;
}

function renderNotFound(container) {
  container.innerHTML = `
    <p>Couldn't find that player.</p>
    <p><a class="back-link" href="roster.html">&larr; Back to roster</a></p>
  `;
  document.title = "Player not found — Suffering Builds Character";
}

async function renderPlayer() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const container = document.getElementById("player-detail");

  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "roster")) {
    renderPageUnavailable(container);
    return;
  }

  let player;
  try {
    const res = await fetch("data/players.json", { cache: "no-store" });
    const data = await res.json();
    player = data.players.find(p => p.id === id);
  } catch (err) {
    container.innerHTML = "<p>Couldn't load player data right now.</p>";
    console.error(err);
    return;
  }

  if (!player) {
    renderNotFound(container);
    return;
  }

  document.title = `${player.name} — Suffering Builds Character`;

  const achievementsHtml = achievementLines(player.achievements).map(a => `<li>${a}</li>`).join("");

  container.style.setProperty("--card-accent", player.accent);
  container.innerHTML = `
    <div class="player-detail-header">
      ${avatarMarkup(player)}
      <div>
        <h2>${nameWithFlag(player)}</h2>
        <p class="role">${player.role} &middot; ${player.game}</p>
      </div>
    </div>

    <div class="detail-grid">
      <div>
        <h4>Bio</h4>
        <p class="bio">${player.bio}</p>

        <h4 style="margin-top:24px">Achievements</h4>
        <ul class="achievements-list">${achievementsHtml}</ul>

        ${videosHtml(player.youtubeVideos)}
      </div>

      <div>
        <div class="sidebar-box">
          <dl>
            <dt>Rank</dt><dd>${player.rank}</dd>
            <dt>Role</dt><dd>${player.role}</dd>
            <dt>Game</dt><dd>${player.game}</dd>
            <dt>Joined</dt><dd>${formatDate(player.joined)}</dd>
          </dl>
        </div>
        ${socialLinksHtml(player)}
      </div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", renderPlayer);
