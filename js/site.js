async function loadSiteSettings() {
  try {
    const res = await fetch("data/site.json", { cache: "no-store" });
    return await res.json();
  } catch (err) {
    console.error("Couldn't load site settings", err);
    return null;
  }
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
}

document.addEventListener("DOMContentLoaded", async () => {
  applySiteSettings(await loadSiteSettings());
});
