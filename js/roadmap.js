function statusClass(status) {
  const s = (status || "").toLowerCase().replace(/\s+/g, "-");
  return s || "planned";
}

async function renderRoadmap() {
  const list = document.getElementById("roadmap-list");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "roadmap")) {
    renderPageUnavailable(list);
    return;
  }
  try {
    const res = await fetch("data/roadmap.json", { cache: "no-store" });
    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      list.innerHTML = "<p>Nothing on the roadmap yet.</p>";
      return;
    }

    list.innerHTML = items.map(item => `
      <article class="roadmap-item">
        <div class="roadmap-marker roadmap-${statusClass(item.status)}"></div>
        <div class="roadmap-body">
          <div class="roadmap-header">
            <h3>${item.title}</h3>
            <span class="roadmap-status roadmap-${statusClass(item.status)}">${item.status || "Planned"}</span>
          </div>
          ${item.target ? `<p class="roadmap-target">${item.target}</p>` : ""}
          ${item.description ? `<p class="roadmap-description">${item.description}</p>` : ""}
        </div>
      </article>
    `).join("");
  } catch (err) {
    list.innerHTML = "<p>Couldn't load the roadmap right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderRoadmap);
