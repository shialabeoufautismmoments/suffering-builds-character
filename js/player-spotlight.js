function renderMissingSpotlight(container, message) {
  container.innerHTML = `
    <p>${message}</p>
    <p><a class="back-link" href="player-spotlights.html">&larr; Back to Player Spotlights</a></p>
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

  if (!spotlight || spotlight.enabled === false) {
    renderMissingSpotlight(container, "That player spotlight doesn't exist.");
    document.title = "Spotlight Not Found — Suffering Builds Character";
    return;
  }

  setMetaTags({
    title: `${spotlight.playerName} — Suffering Builds Character`,
    description: spotlight.summary || plainTextExcerpt(spotlight.notes, 160),
    image: spotlight.photo || undefined
  });

  const bodyHtml = typeof marked !== "undefined"
    ? marked.parse(spotlight.notes || "")
    : `<p class="story">${spotlight.notes || ""}</p>`;

  container.innerHTML = `
    <h2 style="margin-top:0">${spotlight.playerName}</h2>
    ${spotlight.summary ? `<p class="founded">${spotlight.summary}</p>` : ""}
    <div class="markdown-body">${bodyHtml}</div>
    ${documentEmbedHtml(spotlight.document)}
  `;
}

document.addEventListener("DOMContentLoaded", renderSpotlight);
