// Heuristic only: maps the visitor's browser language setting to an Amazon
// storefront domain. This is NOT true IP-based geolocation — a US visitor
// with their browser set to French, for example, will be routed to
// amazon.fr. True region detection would need a paid geolocation service or
// Amazon's own Associates "OneLink" product (separate signup on Amazon's
// side), neither of which is wired up here.
const AMAZON_REGION_DOMAINS = {
  us: "amazon.com", gb: "amazon.co.uk", ca: "amazon.ca", de: "amazon.de",
  fr: "amazon.fr", it: "amazon.it", es: "amazon.es", jp: "amazon.co.jp",
  in: "amazon.in", au: "amazon.com.au", br: "amazon.com.br", mx: "amazon.com.mx",
  nl: "amazon.nl", se: "amazon.se", pl: "amazon.pl", ae: "amazon.ae",
  sg: "amazon.sg", tr: "amazon.com.tr", sa: "amazon.sa", eg: "amazon.eg",
  be: "amazon.com.be"
};

const AMAZON_LANGUAGE_FALLBACKS = {
  de: "amazon.de", fr: "amazon.fr", it: "amazon.it", es: "amazon.es",
  ja: "amazon.co.jp", pt: "amazon.com.br", nl: "amazon.nl", sv: "amazon.se",
  pl: "amazon.pl", tr: "amazon.com.tr", ar: "amazon.sa"
};

function detectAmazonDomain() {
  const lang = (navigator.language || navigator.userLanguage || "en-US").toLowerCase();
  const parts = lang.split("-");
  const region = parts[1];
  if (region && AMAZON_REGION_DOMAINS[region]) return AMAZON_REGION_DOMAINS[region];
  const base = parts[0];
  return AMAZON_LANGUAGE_FALLBACKS[base] || "amazon.com";
}

function asinFromUrl(url) {
  const match = url.match(/\/(?:dp|gp\/product|ASIN)\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : null;
}

function regionalAmazonLink(url) {
  const asin = asinFromUrl(url);
  if (!asin) return url;
  return `https://${detectAmazonDomain()}/dp/${asin}`;
}

function bookCoverMarkup(book) {
  return book.cover
    ? `<img class="book-cover" src="${book.cover}" alt="${book.title} cover" />`
    : `<div class="book-cover book-cover-placeholder">${book.title[0] || "?"}</div>`;
}

async function renderReading() {
  const grid = document.getElementById("book-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "reading")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/books.json", { cache: "no-store" });
    const data = await res.json();
    const books = data.books.filter(b => b.enabled !== false);

    if (!books.length) {
      grid.innerHTML = "<p>No books posted yet.</p>";
      return;
    }

    grid.innerHTML = books.map(b => `
      <article class="book-card">
        ${bookCoverMarkup(b)}
        <div class="book-info">
          <h3>${b.title}</h3>
          ${b.author ? `<p class="book-author">${b.author}</p>` : ""}
          ${b.summary ? `<p class="book-summary">${b.summary}</p>` : ""}
          <div class="book-actions">
            ${b.amazonUrl ? `<a class="hero-button book-buy-button" href="${regionalAmazonLink(b.amazonUrl)}" target="_blank" rel="noopener">Buy on Amazon</a>` : ""}
            ${b.notes ? `<a class="book-notes-link" href="notes.html?slug=${encodeURIComponent(b.slug)}">Notes &rarr;</a>` : ""}
          </div>
        </div>
      </article>
    `).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load the reading list right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderReading);
