function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

const HOME_TILE_DESCRIPTIONS = {
  roster: "Meet the team",
  news: "Announcements & updates",
  staff: "Leadership & staff",
  about: "Our story",
  partners: "Who backs us",
  wiki: "Strategy & reference notes",
  "vod-reviews": "Public VOD breakdowns",
  threads: "Unrolled Twitter/X threads",
  roadmap: "What's coming next",
  coaching: "Get personalized feedback"
};

function quickLinksHtml(site) {
  return (site?.navigation || [])
    .filter(item => item.enabled !== false && item.id !== "home")
    .map(item => `
      <a class="card-list-item" href="${item.path}">
        <h3>${item.label}</h3>
        ${HOME_TILE_DESCRIPTIONS[item.id] ? `<p>${HOME_TILE_DESCRIPTIONS[item.id]}</p>` : ""}
      </a>
    `).join("");
}

function homeInitials(name) {
  return String(name || "").trim().split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function homeAvatarHtml(player) {
  return player.photo
    ? `<img class="player-avatar" src="${player.photo}" alt="${player.name}" />`
    : `<div class="player-avatar">${homeInitials(player.name)}</div>`;
}

function homeFeaturesHtml(features) {
  const items = String(features || "").split("\n").map(item => item.trim()).filter(Boolean);
  return items.length ? `<ul class="pricing-features">${items.map(item => `<li>${item}</li>`).join("")}</ul>` : "";
}

function resolveFeaturedDuo(playersData, testimonialsData) {
  const playersById = new Map((playersData.players || []).map(player => [player.id, player]));
  const enabledCoachIds = new Set((testimonialsData.coaches || [])
    .filter(coach => coach.enabled !== false)
    .map(coach => coach.playerId));
  const resolved = (playersData.coachingDuos || [])
    .filter(duo => duo.enabled !== false)
    .map(duo => ({
      ...duo,
      first: playersById.get(duo.firstCoachId),
      second: playersById.get(duo.secondCoachId)
    }))
    .filter(duo => duo.first && duo.second && duo.first.id !== duo.second.id &&
      enabledCoachIds.has(duo.first.id) && enabledCoachIds.has(duo.second.id));
  return resolved.find(duo => duo.featured) || resolved[0] || null;
}

function homeDuoMemberHtml(player) {
  return `<div class="coaching-duo-member" style="--card-accent:${player.accent}">
    ${homeAvatarHtml(player)}
    <div><h3>${player.name}</h3><p class="role">${player.role} &middot; ${player.game}</p></div>
  </div>`;
}

function renderHomeProof(spotlightsData, testimonialsData) {
  const section = document.getElementById("home-proof-section");
  const grid = document.getElementById("home-proof-grid");
  const spotlight = (spotlightsData.spotlights || []).find(item => item.enabled !== false);
  const testimonial = (testimonialsData.testimonials || []).find(item => item.enabled !== false);

  if (!spotlight && !testimonial) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  grid.innerHTML = `
    ${spotlight ? `<a class="home-result-card" href="player-spotlight.html?slug=${encodeURIComponent(spotlight.slug)}">
      <div class="home-proof-kicker">PLAYER RESULT</div>
      <div class="home-result-content">
        ${spotlight.photo ? `<img src="${spotlight.photo}" alt="${spotlight.playerName}" />` : ""}
        <div><strong>${spotlight.summary || spotlight.playerName}</strong><span>${spotlight.playerName} &middot; Read the case study &rarr;</span></div>
      </div>
    </a>` : ""}
    ${testimonial ? `<article class="home-testimonial-card">
      <div class="home-proof-kicker">CLIENT FEEDBACK</div>
      <blockquote>“${testimonial.quote}”</blockquote>
      <p>${testimonial.name}${testimonial.role ? ` <span>&middot; ${testimonial.role}</span>` : ""}</p>
    </article>` : ""}
  `;
}

function renderHomeDuo(duo) {
  const section = document.getElementById("home-featured-duo-section");
  const container = document.getElementById("home-featured-duo");
  if (!duo) {
    section.hidden = true;
    return;
  }

  const ctaUrl = duo.ctaUrl || "index.html?service=duo#coaching-intake";
  section.hidden = false;
  container.innerHTML = `<article class="coaching-duo-card home-featured-duo">
    <div class="coaching-duo-kicker">FEATURED COACHING DUO</div>
    <h3 class="coaching-duo-title">${duo.name || `${duo.first.name} + ${duo.second.name}`}</h3>
    ${duo.tagline ? `<p class="coaching-duo-tagline">${duo.tagline}</p>` : ""}
    <div class="coaching-duo-members">
      ${homeDuoMemberHtml(duo.first)}
      <span class="coaching-duo-plus" aria-hidden="true">+</span>
      ${homeDuoMemberHtml(duo.second)}
    </div>
    ${duo.price ? `<div class="coaching-duo-price">${duo.price}</div>` : ""}
    ${duo.description ? `<p class="coaching-duo-description">${duo.description}</p>` : ""}
    ${homeFeaturesHtml(duo.features)}
    <div class="coaching-duo-actions"><a class="hero-button" href="${ctaUrl}">${duo.ctaLabel || "Apply for Duo Coaching"}</a></div>
  </article>`;
}

async function renderHomeContent() {
  const [newsData, playersData, testimonialsData, spotlightsData] = await Promise.all([
    fetch("data/news.json", { cache: "no-store" }).then(res => res.json()).catch(() => ({ news: [] })),
    fetch("data/players.json", { cache: "no-store" }).then(res => res.json()).catch(() => ({ players: [], coachingDuos: [] })),
    fetch("data/testimonials.json", { cache: "no-store" }).then(res => res.json()).catch(() => ({ coaches: [], testimonials: [] })),
    fetch("data/spotlights.json", { cache: "no-store" }).then(res => res.json()).catch(() => ({ spotlights: [] }))
  ]);

  const newsTeaser = document.getElementById("home-news-teaser");
  const items = [...(newsData.news || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  newsTeaser.innerHTML = items.length ? items.map(n => `
    <article class="news-item">
      <div class="news-date">${formatDate(n.date)}</div>
      <h3>${n.title}</h3>
      <p>${n.body}</p>
    </article>
  `).join("") : "<p>No announcements yet.</p>";

  renderHomeProof(spotlightsData, testimonialsData);
  renderHomeDuo(resolveFeaturedDuo(playersData, testimonialsData));
}

function setupCoachingIntake() {
  const form = document.getElementById("coaching-intake-form");
  const status = document.getElementById("coaching-intake-status");
  const button = document.getElementById("coaching-intake-submit");
  const service = document.getElementById("coaching-intake-service");
  if (!form) return;

  if (new URLSearchParams(window.location.search).get("service") === "duo") {
    service.value = "Coaching duo";
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Sending…";
    status.className = "coaching-intake-status";
    status.textContent = "Sending your application to the coaching team…";

    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/coaching-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your application could not be sent right now.");
      form.reset();
      status.className = "coaching-intake-status success";
      status.textContent = "Application sent. The HONE coaching team will contact you on Discord.";
    } catch (error) {
      status.className = "coaching-intake-status error";
      status.textContent = error.message || "Your application could not be sent right now.";
    } finally {
      button.disabled = false;
      button.textContent = "Send to the Coaching Team";
    }
  });
}

async function renderHome() {
  const { site } = await window.__siteDataPromise;

  if (isPageDisabled(site, "home")) {
    renderPageUnavailable(document.querySelector("main"));
    return;
  }

  const linksEl = document.getElementById("home-links");
  if (linksEl) linksEl.innerHTML = quickLinksHtml(site);
  setupCoachingIntake();
  await renderHomeContent();

  // The proof and featured-duo sections expand after their data loads. Restore
  // direct links to the form after that reflow so the sticky header does not
  // leave applicants several sections above it.
  if (window.location.hash === "#coaching-intake") {
    requestAnimationFrame(() => document.getElementById("coaching-intake")?.scrollIntoView());
  }
}

document.addEventListener("DOMContentLoaded", renderHome);
