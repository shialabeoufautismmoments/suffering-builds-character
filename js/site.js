// Kicked off immediately (not inside DOMContentLoaded) so every other script
// on the page can `await window.__siteDataPromise` and get the same resolved
// result without racing or re-fetching.
window.__siteDataPromise = (async () => {
  try {
    const [siteRes, pagesRes] = await Promise.all([
      fetch("data/site.json", { cache: "no-store" }),
      fetch("data/pages.json", { cache: "no-store" })
    ]);
    const site = await siteRes.json();
    const pagesData = await pagesRes.json();
    return { site, pages: pagesData.pages || [] };
  } catch (err) {
    console.error("Couldn't load site data", err);
    return { site: null, pages: [] };
  }
})();

function currentFile() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function buildNavHtml(site, pages) {
  const file = currentFile();
  const slug = new URLSearchParams(window.location.search).get("slug");

  const items = (site?.navigation || []).filter(item => item.enabled !== false);
  const topLevel = items.filter(item => !item.parents);
  const children = items.filter(item => item.parents);

  function childrenOf(parentId) {
    return children.filter(c =>
      c.parents.split(",").map(s => s.trim()).includes(parentId)
    );
  }

  const builtinHtml = topLevel.map(item => {
    const kids = childrenOf(item.id);
    const ownActive = item.path && item.path === file;
    const kidActive = kids.some(k => k.path === file);
    const activeClass = (ownActive || kidActive) ? " active" : "";

    const trigger = item.path
      ? `<a href="${item.path}" class="nav-top-link${activeClass}">${item.label}</a>`
      : `<span class="nav-top-link nav-top-label${activeClass}">${item.label}</span>`;

    if (!kids.length) {
      return `<div class="nav-item">${trigger}</div>`;
    }

    const dropdown = kids.map(k =>
      `<a href="${k.path}"${k.path === file ? ' class="active"' : ""}>${k.label}</a>`
    ).join("");

    return `<div class="nav-item has-dropdown">${trigger}<div class="nav-dropdown"><div class="nav-dropdown-inner">${dropdown}</div></div></div>`;
  });

  const customLinksHtml = pages
    .filter(p => p.enabled !== false)
    .map(p => {
      const isActive = file === "page.html" && slug === p.slug;
      return `<div class="nav-item"><a href="page.html?slug=${encodeURIComponent(p.slug)}" class="nav-top-link${isActive ? " active" : ""}">${p.label}</a></div>`;
    });

  return builtinHtml.concat(customLinksHtml).join("");
}

function applySiteSettings(site) {
  if (!site) return;

  const root = document.documentElement;
  if (site.accentColor) root.style.setProperty("--accent", site.accentColor);
  if (site.accentBright) root.style.setProperty("--accent-bright", site.accentBright);

  if (site.siteName) {
    document.querySelectorAll("[data-site-name]").forEach(el => { el.textContent = site.siteName; });
    if (document.title.includes("Suffering Builds Character")) {
      document.title = document.title.replace("Suffering Builds Character", site.siteName);
    }
  }

  if (site.tagline) {
    const taglineEl = document.querySelector("[data-site-tagline]");
    if (taglineEl) taglineEl.textContent = site.tagline;
  }

  if (site.logo) {
    document.querySelectorAll("[data-site-logo]").forEach(el => { el.src = site.logo; });
  }

  const pageKey = document.body.dataset.page;
  if (pageKey && site.pages && site.pages[pageKey]) {
    const copy = site.pages[pageKey];
    const headingEl = document.querySelector("[data-page-heading]");
    if (headingEl && copy.heading) headingEl.textContent = copy.heading;
    const introEl = document.querySelector("[data-page-intro]");
    if (introEl && copy.intro) introEl.textContent = copy.intro;
  }

  const extra = document.getElementById("footer-extra");
  if (extra) {
    const parts = [];
    if (site.footerText) parts.push(site.footerText);
    if (Array.isArray(site.socials) && site.socials.length) {
      parts.push(site.socials.map(s => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join(" &middot; "));
    }
    if (parts.length) {
      extra.innerHTML = `<p class="footer-extra-line">${parts.join(" &middot; ")}</p>`;
    }
  }

  const discordEl = document.getElementById("discord-widget");
  if (discordEl && site.discordServerId) {
    discordEl.innerHTML = `<iframe src="https://discord.com/widget?id=${encodeURIComponent(site.discordServerId)}&theme=dark" width="100%" height="240" allowtransparency="true" frameborder="0" sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe>`;
  }
}

// Shared by every built-in page's own render script: `await window.__siteDataPromise`
// then call this before fetching/rendering that page's own content, so a
// disabled page never flashes its real content first.
function isPageDisabled(site, pageKey) {
  const entry = (site?.navigation || []).find(n => n.id === pageKey);
  return !!entry && entry.enabled === false;
}

function renderPageUnavailable(container) {
  container.innerHTML = `<p>This section isn't available right now.</p>`;
}

// Overrides document.title and the static og:/twitter: meta tags on a
// per-entry page (wiki entry, thread, player, etc.) with real content
// instead of the generic site-wide description baked into the HTML.
// Note: this only affects what browsers see. Discord/Twitter/etc. link
// unfurlers don't run JS, so they'll only pick this up if Netlify
// Prerendering is enabled for the site (Site configuration → Build &
// deploy → Post processing → Prerendering).
function setMetaTags({ title, description, image }) {
  if (title) {
    document.title = title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute("content", title);
  }
  if (description) {
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", description);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", description);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute("content", description);
  }
  if (image) {
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute("content", image);
    const twImage = document.querySelector('meta[name="twitter:image"]');
    if (twImage) twImage.setAttribute("content", image);
  }
}

// Strips basic markdown/whitespace and truncates, for building a link-preview
// description out of a markdown or plain-text body when no summary exists.
function plainTextExcerpt(text, maxLen) {
  const stripped = (text || "")
    .replace(/[#*_>`~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen - 1).trim() + "…" : stripped;
}

// Fetches Wiki/Threads/Roadmap/VOD Reviews/News/Custom Pages once and flattens
// them into one searchable list. Only called the first time someone opens the
// search panel, so pages that never use search don't pay for six extra fetches.
async function buildSearchIndex() {
  const [wiki, threads, roadmap, vod, news, pages] = await Promise.all([
    fetch("data/wiki.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({ entries: [] })),
    fetch("data/threads.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({ threads: [] })),
    fetch("data/roadmap.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({ items: [] })),
    fetch("data/vod-reviews.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({ reviews: [] })),
    fetch("data/news.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({ news: [] })),
    fetch("data/pages.json", { cache: "no-store" }).then(r => r.json()).catch(() => ({ pages: [] }))
  ]);

  const items = [];

  (wiki.entries || []).filter(e => e.enabled !== false).forEach(e => items.push({
    type: "Wiki", title: e.title, snippet: e.summary || "",
    url: `wiki-entry.html?slug=${encodeURIComponent(e.slug)}`
  }));
  (threads.threads || []).filter(t => t.enabled !== false).forEach(t => items.push({
    type: "Thread", title: t.title, snippet: "",
    url: `thread.html?slug=${encodeURIComponent(t.slug)}`
  }));
  (roadmap.items || []).forEach(i => items.push({
    type: "Roadmap", title: i.title, snippet: i.description || "", url: "roadmap.html"
  }));
  (vod.reviews || []).filter(r => r.enabled !== false).forEach(r => items.push({
    type: "VOD Review", title: r.title, snippet: r.summary || "", url: r.docUrl, external: true
  }));
  (news.news || []).forEach(n => items.push({
    type: "News", title: n.title, snippet: n.body || "", url: "news.html"
  }));
  (pages.pages || []).filter(p => p.enabled !== false).forEach(p => items.push({
    type: "Page", title: p.heading || p.label, snippet: "",
    url: `page.html?slug=${encodeURIComponent(p.slug)}`
  }));

  return items;
}

function searchResultsHtml(results) {
  if (!results.length) return `<p class="search-empty">No matches.</p>`;
  return results.slice(0, 20).map(r => `
    <a class="search-result-item" href="${r.url}"${r.external ? ' target="_blank" rel="noopener"' : ""}>
      <div class="search-result-type">${r.type}</div>
      <p class="search-result-title">${r.title}</p>
      ${r.snippet ? `<p class="search-result-snippet">${r.snippet}</p>` : ""}
    </a>
  `).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const { site, pages } = await window.__siteDataPromise;
  applySiteSettings(site);

  const navEl = document.getElementById("site-nav");
  if (navEl) navEl.innerHTML = buildNavHtml(site, pages);

  const toggle = document.getElementById("nav-toggle");
  if (toggle && navEl) {
    toggle.addEventListener("click", () => {
      const isOpen = navEl.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  const searchToggle = document.getElementById("search-toggle");
  const searchPanel = document.getElementById("search-panel");
  const searchInput = document.getElementById("search-input");
  const searchResults = document.getElementById("search-results");

  if (searchToggle && searchPanel && searchInput && searchResults) {
    let indexPromise = null;

    function runSearch(query) {
      const q = query.trim().toLowerCase();
      if (q.length < 2) {
        searchResults.innerHTML = `<p class="search-hint">Type at least 2 characters…</p>`;
        return;
      }
      indexPromise.then(items => {
        const matches = items.filter(i =>
          i.title.toLowerCase().includes(q) || i.snippet.toLowerCase().includes(q)
        );
        searchResults.innerHTML = searchResultsHtml(matches);
      });
    }

    let debounceTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(searchInput.value), 150);
    });

    searchToggle.addEventListener("click", () => {
      const opening = searchPanel.hasAttribute("hidden");
      if (opening) {
        searchPanel.removeAttribute("hidden");
        if (!indexPromise) indexPromise = buildSearchIndex();
        searchInput.focus();
        if (searchInput.value) runSearch(searchInput.value);
      } else {
        searchPanel.setAttribute("hidden", "");
      }
    });

    document.addEventListener("click", e => {
      if (!searchPanel.hasAttribute("hidden") && !searchPanel.contains(e.target) && e.target !== searchToggle && !searchToggle.contains(e.target)) {
        searchPanel.setAttribute("hidden", "");
      }
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape") searchPanel.setAttribute("hidden", "");
    });
  }
});
