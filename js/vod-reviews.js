function formatReviewDate(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

async function renderVodReviews() {
  const list = document.getElementById("vod-reviews-list");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "vod-reviews")) {
    renderPageUnavailable(list);
    return;
  }
  try {
    const res = await fetch("data/vod-reviews.json", { cache: "no-store" });
    const data = await res.json();
    const items = (data.reviews || []).filter(r => r.enabled !== false);

    if (!items.length) {
      list.innerHTML = "<p>No VOD reviews posted yet.</p>";
      return;
    }

    list.innerHTML = items.map(r => {
      const metaParts = [];
      if (r.subject) metaParts.push(r.subject);
      if (r.date) metaParts.push(formatReviewDate(r.date));
      const metaHtml = metaParts.length
        ? `<p class="vod-review-meta">${metaParts.join(" &middot; ")}</p>`
        : "";

      return `
        <a class="card-list-item" href="${r.docUrl}" target="_blank" rel="noopener">
          <h3>${r.title}</h3>
          ${metaHtml}
          ${r.summary ? `<p>${r.summary}</p>` : ""}
        </a>
      `;
    }).join("");
  } catch (err) {
    list.innerHTML = "<p>Couldn't load VOD reviews right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderVodReviews);
