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

  const builtinLinks = (site?.navigation || [])
    .filter(item => item.enabled !== false)
    .map(item => {
      const isActive = item.path === file;
      return `<a href="${item.path}"${isActive ? ' class="active"' : ""}>${item.label}</a>`;
    });

  const customLinks = pages
    .filter(p => p.enabled !== false)
    .map(p => {
      const isActive = file === "page.html" && slug === p.slug;
      return `<a href="page.html?slug=${encodeURIComponent(p.slug)}"${isActive ? ' class="active"' : ""}>${p.label}</a>`;
    });

  return builtinLinks.concat(customLinks).join("");
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
});
