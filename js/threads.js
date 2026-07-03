async function renderThreadsIndex() {
  const list = document.getElementById("threads-list");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "threads")) {
    renderPageUnavailable(list);
    return;
  }
  try {
    const res = await fetch("data/threads.json", { cache: "no-store" });
    const data = await res.json();
    const items = data.threads.filter(t => t.enabled !== false);

    if (!items.length) {
      list.innerHTML = "<p>No threads posted yet.</p>";
      return;
    }

    list.innerHTML = items.map(t => {
      const count = (t.tweetUrls || []).length;
      return `
        <a class="card-list-item" href="thread.html?slug=${encodeURIComponent(t.slug)}">
          <h3>${t.title}</h3>
          <p>${count} tweet${count === 1 ? "" : "s"}</p>
        </a>
      `;
    }).join("");
  } catch (err) {
    list.innerHTML = "<p>Couldn't load threads right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderThreadsIndex);
