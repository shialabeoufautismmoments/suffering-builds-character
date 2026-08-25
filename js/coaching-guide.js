function guideLines(value) {
  return String(value || "").split("\n").map(line => line.trim()).filter(Boolean);
}

function guideServiceHtml(service) {
  const features = guideLines(service.features);
  return `<article class="coaching-compare-card${service.featured ? " featured" : ""}">
    ${service.featured ? '<div class="pricing-badge">Recommended</div>' : ""}
    <div class="coaching-compare-head"><h3>${escapeSiteHtml(service.name)}</h3><strong>${escapeSiteHtml(service.price || "Ask for pricing")}</strong></div>
    <p class="coaching-compare-best"><span>Best for</span>${escapeSiteHtml(service.bestFor || "")}</p>
    <dl class="coaching-compare-facts">
      <div><dt>Format</dt><dd>${escapeSiteHtml(service.format || "")}</dd></div>
      <div><dt>Support</dt><dd>${escapeSiteHtml(service.support || "")}</dd></div>
    </dl>
    ${features.length ? `<ul class="pricing-features">${features.map(feature => `<li>${escapeSiteHtml(feature)}</li>`).join("")}</ul>` : ""}
    ${service.ctaUrl ? `<a class="hero-button${service.featured ? "" : " hero-button-secondary"}" href="${escapeSiteHtml(service.ctaUrl)}">${escapeSiteHtml(service.ctaLabel || "Learn More")}</a>` : ""}
  </article>`;
}

async function renderCoachingGuide() {
  const comparison = document.getElementById("coaching-comparison");
  const faq = document.getElementById("coaching-faq");
  const closing = document.getElementById("coaching-guide-closing");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "coaching-guide")) {
    renderPageUnavailable(comparison);
    return;
  }

  try {
    const [data, players, team] = await Promise.all([
      fetch("data/coaching-guide.json", { cache: "no-store" }).then(response => response.json()),
      fetch("data/players.json", { cache: "no-store" }).then(response => response.json()),
      fetch("data/team-coaching.json", { cache: "no-store" }).then(response => response.json())
    ]);
    const services = (data.services || []).filter(item => item.enabled !== false).map(service => {
      let source = null;
      if (service.sourceType === "Duo Coaching") source = (players.coachingDuos || []).find(item => item.enabled !== false && (!service.sourceName || item.name === service.sourceName));
      if (service.sourceType === "Team Coaching") source = (team.packages || []).find(item => item.enabled !== false && (!service.sourceName || item.name === service.sourceName));
      return source ? { ...service, price: source.price || service.price, features: source.features || service.features, ctaLabel: source.ctaLabel || service.ctaLabel, ctaUrl: source.ctaUrl || service.ctaUrl } : service;
    });
    const questions = (data.faq || []).filter(item => item.enabled !== false);
    comparison.innerHTML = `<div class="coaching-guide-intro"><div class="coaching-intake-kicker">${escapeSiteHtml(data.eyebrow || "COMPARE COACHING")}</div><h2 id="comparison-heading">Find the right level of support</h2><p>${escapeSiteHtml(data.intro || "")}</p></div>
      <div class="coaching-compare-grid">${services.length ? services.map(guideServiceHtml).join("") : "<p>No coaching options are published yet.</p>"}</div>`;
    faq.innerHTML = questions.length ? questions.map((item, index) => `<details class="coaching-faq-item" ${index === 0 ? "open" : ""}><summary>${escapeSiteHtml(item.question)}</summary><p>${linkifyPlainText(item.answer)}</p></details>`).join("") : "<p>No frequently asked questions are published yet.</p>";
    closing.innerHTML = `<h2>${escapeSiteHtml(data.closingHeading || "Ready to begin?")}</h2><p>${escapeSiteHtml(data.closingText || "")}</p>${data.closingUrl ? `<a class="hero-button" href="${escapeSiteHtml(data.closingUrl)}">${escapeSiteHtml(data.closingLabel || "Get Started")}</a>` : ""}`;
  } catch (error) {
    comparison.innerHTML = "<p>Couldn't load the coaching comparison right now.</p>";
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", renderCoachingGuide);
