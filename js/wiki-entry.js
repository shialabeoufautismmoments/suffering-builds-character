function renderMissingEntry(container, message) {
  container.innerHTML = `
    <p>${message}</p>
    <p><a class="back-link" href="wiki.html">&larr; Back to Wiki</a></p>
  `;
}

function pdfEmbedHtml(pdfUrl) {
  if (!pdfUrl) return "";
  return `
    <div class="pdf-embed">
      <iframe src="${pdfUrl}" title="PDF attachment"></iframe>
    </div>
    <a class="pdf-download-link" href="${pdfUrl}" target="_blank" rel="noopener" download>Download PDF</a>
  `;
}

async function renderWikiEntry() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  const container = document.getElementById("wiki-entry-content");

  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "wiki")) {
    renderPageUnavailable(container);
    return;
  }

  let entry;
  try {
    const res = await fetch("data/wiki.json", { cache: "no-store" });
    const data = await res.json();
    entry = data.entries.find(e => e.slug === slug);
  } catch (err) {
    renderMissingEntry(container, "Couldn't load this entry right now.");
    console.error(err);
    return;
  }

  if (!entry || entry.enabled === false) {
    renderMissingEntry(container, "That wiki entry doesn't exist.");
    document.title = "Entry Not Found — Suffering Builds Character";
    return;
  }

  document.title = `${entry.title} — Suffering Builds Character`;

  const bodyHtml = typeof marked !== "undefined"
    ? marked.parse(entry.body || "")
    : `<p class="story">${entry.body || ""}</p>`;

  container.innerHTML = `<h2 style="margin-top:0">${entry.title}</h2><div class="markdown-body">${bodyHtml}</div>${pdfEmbedHtml(entry.pdf)}`;
}

document.addEventListener("DOMContentLoaded", renderWikiEntry);
