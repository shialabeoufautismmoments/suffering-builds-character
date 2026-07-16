function pricingFeaturesHtml(features) {
  const lines = (features || "").split("\n").map(f => f.trim()).filter(Boolean);
  if (!lines.length) return "";
  return `<ul class="pricing-features">${lines.map(f => `<li>${f}</li>`).join("")}</ul>`;
}

function pricingCardHtml(pkg, page) {
  const ctaLabel = pkg.ctaLabel || page.contactLabel || "Contact us";
  const ctaUrl = pkg.ctaUrl || page.contactUrl || "";
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

async function renderTeamCoaching() {
  const grid = document.getElementById("pricing-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "team-coaching")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/team-coaching.json", { cache: "no-store" });
    const page = await res.json();

    const headerEl = document.getElementById("team-coaching-header");
    if (page.tagline || page.contactUrl) {
      const extra = document.createElement("div");
      extra.className = "pricing-page-cta";
      extra.innerHTML = `
        ${page.tagline ? `<p class="pricing-page-tagline">${page.tagline}</p>` : ""}
        ${page.contactUrl ? `<a class="hero-button" href="${page.contactUrl}" target="_blank" rel="noopener">${page.contactLabel || "Contact us for a custom quote"}</a>` : ""}
      `;
      headerEl.appendChild(extra);
    }

    const packages = (page.packages || []).filter(p => p.enabled !== false);
    if (!packages.length) {
      grid.innerHTML = "<p>No team coaching packages listed yet.</p>";
      return;
    }
    grid.innerHTML = packages.map(pkg => pricingCardHtml(pkg, page)).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load team coaching packages right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderTeamCoaching);
