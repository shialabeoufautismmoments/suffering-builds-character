function partnerLogoHtml(p) {
  return p.logo
    ? `<img class="partner-logo" src="${p.logo}" alt="${p.name}" />`
    : `<div class="partner-logo partner-logo-placeholder">${p.name}</div>`;
}

function partnerCardHtml(p) {
  const inner = `
    ${partnerLogoHtml(p)}
    <h3>${p.name}</h3>
    ${p.description ? `<p>${p.description}</p>` : ""}
  `;

  return p.url
    ? `<a class="partner-card" href="${p.url}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="partner-card">${inner}</div>`;
}

async function renderPartners() {
  const grid = document.getElementById("partners-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "partners")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/partners.json", { cache: "no-store" });
    const data = await res.json();
    const items = (data.partners || []).filter(p => p.enabled !== false);

    if (!items.length) {
      grid.innerHTML = "<p>No partners listed yet.</p>";
      return;
    }

    grid.innerHTML = items.map(partnerCardHtml).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load partners right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderPartners);
