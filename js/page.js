function renderMissing(container, message) {
  container.innerHTML = `
    <p>${message}</p>
    <p><a class="back-link" href="index.html">&larr; Back to roster</a></p>
  `;
}

async function renderCustomPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");
  const container = document.getElementById("custom-page-content");

  let page;
  try {
    const res = await fetch("data/pages.json", { cache: "no-store" });
    const data = await res.json();
    page = data.pages.find(p => p.slug === slug);
  } catch (err) {
    renderMissing(container, "Couldn't load this page right now.");
    console.error(err);
    return;
  }

  if (!page) {
    renderMissing(container, "That page doesn't exist.");
    document.title = "Page Not Found — Suffering Builds Character";
    return;
  }

  if (page.enabled === false) {
    renderMissing(container, "This page isn't available right now.");
    document.title = "Page Not Found — Suffering Builds Character";
    return;
  }

  document.title = `${page.heading} — Suffering Builds Character`;

  const headingEl = document.querySelector("[data-page-heading]");
  if (headingEl) headingEl.textContent = page.heading;

  const bodyHtml = (page.body || "")
    .split(/\n\s*\n/)
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join("");

  container.innerHTML = bodyHtml || "<p></p>";
}

document.addEventListener("DOMContentLoaded", renderCustomPage);
