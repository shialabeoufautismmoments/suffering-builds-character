const UNCATEGORIZED = "Uncategorized";

function cardHtml(e) {
  const category = e.category ? e.category.trim() : "";
  return `
    <a class="card-list-item" href="wiki-entry.html?slug=${encodeURIComponent(e.slug)}" data-category="${category || UNCATEGORIZED}">
      ${category ? `<p class="card-list-category">${category}</p>` : ""}
      <h3>${e.title}</h3>
      ${e.summary ? `<p>${e.summary}</p>` : ""}
    </a>
  `;
}

function tabsHtml(categories) {
  if (categories.length < 2) return "";
  const buttons = categories.map(c =>
    `<button type="button" class="wiki-category-tab" data-filter="${c}">${c}</button>`
  ).join("");
  return `
    <div class="wiki-category-tabs">
      <button type="button" class="wiki-category-tab active" data-filter="all">All</button>
      ${buttons}
    </div>
  `;
}

function wireTabs(container, list) {
  const tabs = container.querySelectorAll(".wiki-category-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const filter = tab.dataset.filter;
      list.querySelectorAll(".card-list-item").forEach(card => {
        card.style.display = (filter === "all" || card.dataset.category === filter) ? "" : "none";
      });
    });
  });
}

async function renderWikiIndex() {
  const tabsContainer = document.getElementById("wiki-tabs");
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

    const categories = [...new Set(
      items.map(e => (e.category ? e.category.trim() : "") || UNCATEGORIZED)
    )].sort((a, b) => a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b));

    tabsContainer.innerHTML = tabsHtml(categories);
    list.innerHTML = items.map(cardHtml).join("");
    wireTabs(tabsContainer, list);
  } catch (err) {
    list.innerHTML = "<p>Couldn't load the wiki right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderWikiIndex);
