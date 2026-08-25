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
  coaching: "Get personalized feedback",
  spotlights: "See real player development",
  "how-it-works": "Understand the coaching process",
  "team-coaching": "Build a stronger roster",
  "client-login": "Open your coaching workspace"
};

function quickLinksHtml(site) {
  const priority = ["coaching", "spotlights", "how-it-works", "team-coaching", "roster", "client-login"];
  const navigation = new Map((site?.navigation || []).map(item => [item.id, item]));
  return priority
    .map(id => navigation.get(id))
    .filter(item => item && item.enabled !== false && item.path)
    .map(item => `
      <a class="card-list-item" href="${item.path}">
      <h3>${escapeSiteHtml(item.label)}</h3>
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
  const publicResults = (spotlightsData.spotlights || []).filter(item => item.enabled !== false && item.consentConfirmed === true);
  const spotlight = publicResults.find(item => item.featured) || publicResults[0];
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
        <div><strong>${spotlight.summary || spotlight.result || spotlight.playerName}</strong><span>${spotlight.playerName} &middot; Read the result &rarr;</span></div>
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
      <h3>${escapeSiteHtml(n.title)}</h3>
      <p>${linkifyPlainText(n.body)}</p>
    </article>
  `).join("") : "<p>No announcements yet.</p>";

  renderHomeProof(spotlightsData, testimonialsData);
  renderHomeDuo(resolveFeaturedDuo(playersData, testimonialsData));
}

function setupCoachingIntake(site) {
  const form = document.getElementById("coaching-intake-form");
  const status = document.getElementById("coaching-intake-status");
  const button = document.getElementById("coaching-intake-submit");
  const next = document.getElementById("coaching-intake-next");
  const back = document.getElementById("coaching-intake-back");
  const service = document.getElementById("coaching-intake-service");
  const referralBanner = document.getElementById("coaching-referral-banner");
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const referralCode = String(params.get("ref") || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
  let referrerHost = "";
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin !== window.location.origin) referrerHost = referrer.host;
  } catch (error) {}
  const attribution = {
    referralCode,
    landingPath: String(params.get("from") || window.location.pathname || "/").startsWith("/") ? String(params.get("from") || window.location.pathname || "/").slice(0, 180) : "/",
    referrerHost,
    utmSource: String(params.get("utm_source") || "").slice(0, 100),
    utmMedium: String(params.get("utm_medium") || "").slice(0, 100),
    utmCampaign: String(params.get("utm_campaign") || "").slice(0, 120),
    utmContent: String(params.get("utm_content") || "").slice(0, 120),
    utmTerm: String(params.get("utm_term") || "").slice(0, 120),
  };
  if (referralCode && referralBanner) {
    referralBanner.hidden = false;
    referralBanner.textContent = `Referral code ${referralCode} applied. If you become a client, the referring player can receive their coaching reward.`;
  }

  const panels = [...form.querySelectorAll("[data-coaching-step]")];
  const stepNumber = document.getElementById("coaching-step-number");
  const stepLabel = document.getElementById("coaching-step-label");
  const progress = document.getElementById("coaching-intake-progress-bar");
  const responseTime = site?.coachingResponseTime || "within 2 business days";
  document.querySelectorAll("[data-response-time]").forEach(element => { element.textContent = responseTime; });
  const labels = {
    name: "Your name", discord: "Your Discord username", game: "A game", rank: "Your current rank",
    role: "Your role or heroes", service: "A coaching preference", availability: "Your availability and time zone",
    vodUrl: "A complete VOD or replay URL", goals: "Your coaching goals", consent: "Your agreement to the policies",
  };
  let currentStep = 0;
  form.classList.add("is-enhanced");

  function showStep(index, moveFocus = true) {
    currentStep = Math.max(0, Math.min(index, panels.length - 1));
    panels.forEach((panel, panelIndex) => { panel.hidden = panelIndex !== currentStep; });
    if (stepNumber) stepNumber.textContent = `${currentStep + 1} / ${panels.length}`;
    if (stepLabel) stepLabel.textContent = currentStep ? "Goals" : "Player details";
    if (progress) progress.style.width = `${((currentStep + 1) / panels.length) * 100}%`;
    if (moveFocus) panels[currentStep]?.querySelector("input, select, textarea")?.focus({ preventScroll: true });
  }

  function validateField(field) {
    const error = document.getElementById(`error-${field.name}`);
    let message = "";
    if (field.validity.valueMissing) message = `${labels[field.name] || "This field"} is required.`;
    else if (field.validity.typeMismatch) message = "Enter a complete link beginning with http:// or https://.";
    else if (!field.validity.valid) message = "Check this field and try again.";
    field.setAttribute("aria-invalid", String(!!message));
    field.classList.toggle("invalid", !!message);
    if (error) error.textContent = message;
    return !message;
  }

  function validatePanel(index, focus = true) {
    const fields = [...panels[index].querySelectorAll("input, select, textarea")];
    const invalid = fields.filter(field => !validateField(field));
    if (focus) invalid[0]?.focus();
    return !invalid.length;
  }

  form.querySelectorAll("input, select, textarea").forEach(field => {
    field.addEventListener("blur", () => validateField(field));
    field.addEventListener("input", () => { if (field.validity.valid) validateField(field); });
    field.addEventListener("change", () => validateField(field));
  });

  next?.addEventListener("click", () => {
    if (validatePanel(0)) showStep(1);
  });
  back?.addEventListener("click", () => showStep(0));

  if (new URLSearchParams(window.location.search).get("service") === "duo") {
    service.value = "Coaching duo";
  }

  showStep(0, false);

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const invalidStep = panels.findIndex((_, index) => !validatePanel(index, false));
    if (invalidStep !== -1) {
      showStep(invalidStep);
      validatePanel(invalidStep);
      status.className = "coaching-intake-status error";
      status.setAttribute("role", "alert");
      status.textContent = "Check the highlighted fields before sending.";
      return;
    }

    button.disabled = true;
    button.textContent = "Sending…";
    status.className = "coaching-intake-status";
    status.setAttribute("role", "status");
    status.textContent = "Saving your application…";

    try {
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      payload.consent = formData.get("consent") === "on";
      Object.assign(payload, attribution);
      const response = await fetch("/api/coaching-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your application could not be sent right now.");
      form.reset();
      showStep(0, false);
      status.className = "coaching-intake-status success";
      status.setAttribute("role", "status");
      status.textContent = `Application received. The HONE team will usually contact you on Discord ${responseTime}.`;
      status.focus();
    } catch (error) {
      status.className = "coaching-intake-status error";
      status.setAttribute("role", "alert");
      status.textContent = error.message || "Your application could not be sent right now.";
      status.focus();
    } finally {
      button.disabled = false;
      button.textContent = "Send Application";
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
  setupCoachingIntake(site);
  await renderHomeContent();

  // The proof and featured-duo sections expand after their data loads. Restore
  // direct links to the form after that reflow so the sticky header does not
  // leave applicants several sections above it.
  if (window.location.hash === "#coaching-intake") {
    requestAnimationFrame(() => document.getElementById("coaching-intake")?.scrollIntoView());
  }
}

document.addEventListener("DOMContentLoaded", renderHome);
