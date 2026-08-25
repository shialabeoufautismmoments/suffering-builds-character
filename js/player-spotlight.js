function renderMissingSpotlight(container, message) {
  container.innerHTML = `
    <p>${message}</p>
    <p><a class="back-link" href="player-spotlights.html">&larr; Back to Results</a></p>
  `;
}

function documentEmbedHtml(docUrl) {
  if (!docUrl) return "";
  return `
    <div class="pdf-embed">
      <iframe src="${docUrl}" title="Document attachment"></iframe>
    </div>
    <a class="pdf-download-link" href="${docUrl}" target="_blank" rel="noopener" download>Download document</a>
  `;
}

async function renderSpotlight() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  const container = document.getElementById("spotlight-content");

  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "spotlights")) {
    renderPageUnavailable(container);
    return;
  }

  let spotlight;
  try {
    const res = await fetch("data/spotlights.json", { cache: "no-store" });
    const data = await res.json();
    spotlight = (data.spotlights || []).find(s => s.slug === slug);
  } catch (err) {
    renderMissingSpotlight(container, "Couldn't load this spotlight right now.");
    console.error(err);
    return;
  }

  if (!spotlight || spotlight.enabled === false || spotlight.consentConfirmed !== true) {
    renderMissingSpotlight(container, "That player spotlight doesn't exist.");
    document.title = "Spotlight Not Found — Suffering Builds Character";
    return;
  }

  setMetaTags({
    title: `${spotlight.playerName} — Suffering Builds Character`,
    image: spotlight.photo || undefined
  });

  const bodyHtml = typeof marked !== "undefined"
    ? marked.parse(spotlight.notes || "")
    : `<p class="story">${spotlight.notes || ""}</p>`;

  const focusAreas = String(spotlight.focusAreas || "").split("\n").map(value => value.trim()).filter(Boolean);
  const metrics = (spotlight.metrics || []).filter(metric => metric.label && (metric.before || metric.after));
  container.innerHTML = `
    <div class="result-detail-head">
      <div><div class="coaching-intake-kicker">PLAYER RESULT</div><h2>${escapeSiteHtml(spotlight.playerName)}</h2>${spotlight.summary ? `<p>${escapeSiteHtml(spotlight.summary)}</p>` : ""}</div>
      <div class="result-detail-meta">${[spotlight.game, spotlight.coachingType, spotlight.timeframe].filter(Boolean).map(value => `<span>${escapeSiteHtml(value)}</span>`).join("")}</div>
    </div>
    ${(spotlight.startingPoint || spotlight.result) ? `<div class="result-detail-arc"><div><small>Starting point</small><strong>${escapeSiteHtml(spotlight.startingPoint || "—")}</strong></div><b aria-hidden="true">→</b><div><small>Result</small><strong>${escapeSiteHtml(spotlight.result || "—")}</strong></div></div>` : ""}
    ${metrics.length ? `<div class="result-metrics">${metrics.map(metric => `<article><span>${escapeSiteHtml(metric.label)}</span><div><small>${escapeSiteHtml(metric.before || "—")}</small><b>→</b><strong>${escapeSiteHtml(metric.after || "—")}</strong></div></article>`).join("")}</div>` : ""}
    ${(spotlight.coaches || focusAreas.length) ? `<div class="result-program"><div><span>Coaches</span><strong>${escapeSiteHtml(spotlight.coaches || "HONE coaching team")}</strong></div><div><span>Focus areas</span><p>${focusAreas.map(area => `<em>${escapeSiteHtml(area)}</em>`).join("")}</p></div></div>` : ""}
    <div class="markdown-body">${bodyHtml}</div>
    ${documentEmbedHtml(spotlight.document)}
    <p class="result-disclaimer">Individual results vary. Improvement depends on practice, consistency, and competitive conditions.</p>
  `;
}

document.addEventListener("DOMContentLoaded", renderSpotlight);
