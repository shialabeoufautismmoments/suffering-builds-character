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

function starRating(rating) {
  const n = parseInt(rating, 10) || 0;
  if (!n) return "";
  return "&#9733;".repeat(n) + "&#9734;".repeat(5 - n);
}

function pdfLinkHtml(pdfUrl) {
  if (!pdfUrl) return "";
  return `<a class="pdf-download-link" href="${pdfUrl}" target="_blank" rel="noopener" download>View coaching report (PDF)</a>`;
}

function pricingHtml(pricing) {
  const lines = (pricing || "").split("\n").map(p => p.trim()).filter(Boolean);
  if (!lines.length) return "";
  return `<ul class="coach-pricing">${lines.map(p => `<li>${p}</li>`).join("")}</ul>`;
}

function renderCoaches(coachesGrid, coaches, players) {
  const resolved = coaches
    .filter(c => c.enabled !== false)
    .map(c => ({ ...c, player: players.find(p => p.id === c.playerId) }))
    .filter(c => {
      if (!c.player) {
        console.error(`Coach entry references unknown player ID "${c.playerId}"`);
        return false;
      }
      return true;
    });

  if (!resolved.length) {
    coachesGrid.innerHTML = "<p>No coaches listed yet.</p>";
    return;
  }

  coachesGrid.innerHTML = resolved.map(c => `
    <a class="staff-card" style="--card-accent:${c.player.accent}" href="${c.calLink}" target="_blank" rel="noopener">
      <div class="staff-card-header">
        ${avatarMarkup(c.player)}
        <div>
          <h3>${nameWithFlag(c.player)}</h3>
          <p class="role">${c.player.role} &middot; ${c.player.game}</p>
        </div>
      </div>
      <p class="staff-bio">${c.description}</p>
      ${pricingHtml(c.pricing)}
    </a>
  `).join("");
}

function pricingFeaturesHtml(features) {
  const lines = (features || "").split("\n").map(f => f.trim()).filter(Boolean);
  if (!lines.length) return "";
  return `<ul class="pricing-features">${lines.map(f => `<li>${f}</li>`).join("")}</ul>`;
}

function packageCardHtml(pkg, page) {
  const ctaLabel = pkg.ctaLabel || page.packagesContactLabel || "Contact us";
  const ctaUrl = pkg.ctaUrl || page.packagesContactUrl || "";
  const featured = !!pkg.featured;
  return `
    <div class="pricing-card${featured ? " pricing-featured" : ""}">
      ${featured ? `<div class="pricing-badge">Recommended</div>` : ""}
      <h3>${pkg.name}</h3>
      <div class="pricing-price">${pkg.price || ""}</div>
      ${pkg.tagline ? `<p class="pricing-tagline">${pkg.tagline}</p>` : ""}
      ${pricingFeaturesHtml(pkg.features)}
      ${ctaUrl
        ? `<a class="hero-button${featured ? "" : " hero-button-secondary"}" href="${ctaUrl}" target="_blank" rel="noopener">${ctaLabel}</a>`
        : `<span class="hero-button hero-button-secondary pricing-cta-disabled">${ctaLabel}</span>`}
    </div>
  `;
}

function renderPackages(section, introEl, grid, testimonialsData) {
  const packages = (testimonialsData.packages || []).filter(p => p.enabled !== false);
  if (!packages.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  introEl.textContent = testimonialsData.packagesIntro || "";
  grid.innerHTML = packages.map(pkg => packageCardHtml(pkg, testimonialsData)).join("");
}

function renderTestimonials(testimonialGrid, testimonials) {
  const items = testimonials.filter(t => t.enabled !== false);

  if (!items.length) {
    testimonialGrid.innerHTML = "<p>No testimonials yet.</p>";
    return;
  }

  testimonialGrid.innerHTML = items.map(t => `
    <article class="testimonial-card">
      ${t.rating ? `<div class="testimonial-stars">${starRating(t.rating)}</div>` : ""}
      <p class="testimonial-quote">"${t.quote}"</p>
      <p class="testimonial-name">${t.name}${t.role ? ` <span class="testimonial-role">&middot; ${t.role}</span>` : ""}</p>
      ${pdfLinkHtml(t.pdf)}
    </article>
  `).join("");
}

async function renderCoachingPage() {
  const coachesGrid = document.getElementById("coaches-grid");
  const testimonialGrid = document.getElementById("testimonial-grid");
  const packagesSection = document.getElementById("packages-section");
  const packagesIntro = document.getElementById("packages-intro");
  const packagesGrid = document.getElementById("packages-grid");

  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "coaching")) {
    renderPageUnavailable(coachesGrid);
    testimonialGrid.innerHTML = "";
    packagesSection.hidden = true;
    return;
  }

  try {
    const [testimonialsRes, playersRes] = await Promise.all([
      fetch("data/testimonials.json", { cache: "no-store" }),
      fetch("data/players.json", { cache: "no-store" })
    ]);
    const testimonialsData = await testimonialsRes.json();
    const playersData = await playersRes.json();

    renderCoaches(coachesGrid, testimonialsData.coaches || [], playersData.players);
    renderPackages(packagesSection, packagesIntro, packagesGrid, testimonialsData);
    renderTestimonials(testimonialGrid, testimonialsData.testimonials || []);
  } catch (err) {
    coachesGrid.innerHTML = "<p>Couldn't load coaches right now.</p>";
    testimonialGrid.innerHTML = "<p>Couldn't load testimonials right now.</p>";
    packagesSection.hidden = true;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderCoachingPage);
