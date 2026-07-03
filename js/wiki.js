async function renderWikiIndex() {
  const list = document.getElementById("wiki-list");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "wiki")) {
    renderPageUnavailable(list);
    return;
  }
  try {
    const res = await fetch("data/wiki.json", { cache: "no-store" });
    const data = await res.json();
    const items = data.entries.filter(e => e.enabled !== false);

    if (!items.length) {
      list.innerHTML = "<p>No wiki entries yet.</p>";
      return;
    }

    list.innerHTML = items.map(e => `
      <a class="card-list-item" href="wiki-entry.html?slug=${encodeURIComponent(e.slug)}">
        <h3>${e.title}</h3>
        ${e.summary ? `<p>${e.summary}</p>` : ""}
      </a>
    `).join("");
  } catch (err) {
    list.innerHTML = "<p>Couldn't load the wiki right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderWikiIndex);
