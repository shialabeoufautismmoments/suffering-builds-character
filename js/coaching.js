function starRating(rating) {
  const n = parseInt(rating, 10) || 0;
  if (!n) return "";
  return "&#9733;".repeat(n) + "&#9734;".repeat(5 - n);
}

function pdfLinkHtml(pdfUrl) {
  if (!pdfUrl) return "";
  return `<a class="pdf-download-link" href="${pdfUrl}" target="_blank" rel="noopener" download>View coaching report (PDF)</a>`;
}

async function renderTestimonials() {
  const grid = document.getElementById("testimonial-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "coaching")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const res = await fetch("data/testimonials.json", { cache: "no-store" });
    const data = await res.json();
    const items = data.testimonials.filter(t => t.enabled !== false);

    if (!items.length) {
      grid.innerHTML = "<p>No testimonials yet.</p>";
      return;
    }

    grid.innerHTML = items.map(t => `
      <article class="testimonial-card">
        ${t.rating ? `<div class="testimonial-stars">${starRating(t.rating)}</div>` : ""}
        <p class="testimonial-quote">"${t.quote}"</p>
        <p class="testimonial-name">${t.name}${t.role ? ` <span class="testimonial-role">&middot; ${t.role}</span>` : ""}</p>
        ${pdfLinkHtml(t.pdf)}
      </article>
    `).join("");
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load testimonials right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderTestimonials);
