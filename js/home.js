function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

const HOME_TILE_DESCRIPTIONS = {
  roster: "Meet the team",
  news: "Announcements & updates",
  schedule: "Upcoming scrims & events",
  staff: "Leadership & staff",
  about: "Our story",
  wiki: "Strategy & reference notes",
  threads: "Unrolled Twitter/X threads",
  roadmap: "What's coming next",
  coaching: "Get personalized feedback"
};

function quickLinksHtml(site) {
  return (site?.navigation || [])
    .filter(item => item.enabled !== false && item.id !== "home")
    .map(item => `
      <a class="card-list-item" href="${item.path}">
        <h3>${item.label}</h3>
        ${HOME_TILE_DESCRIPTIONS[item.id] ? `<p>${HOME_TILE_DESCRIPTIONS[item.id]}</p>` : ""}
      </a>
    `).join("");
}

async function renderHome() {
  const { site } = await window.__siteDataPromise;

  if (isPageDisabled(site, "home")) {
    renderPageUnavailable(document.querySelector("main"));
    return;
  }

  const linksEl = document.getElementById("home-links");
  if (linksEl) linksEl.innerHTML = quickLinksHtml(site);

  const newsTeaser = document.getElementById("home-news-teaser");
  if (!newsTeaser) return;
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    const data = await res.json();
    const items = [...data.news].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);

    if (!items.length) {
      newsTeaser.innerHTML = "<p>No announcements yet.</p>";
      return;
    }

    newsTeaser.innerHTML = items.map(n => `
      <article class="news-item">
        <div class="news-date">${formatDate(n.date)}</div>
        <h3>${n.title}</h3>
        <p>${n.body}</p>
      </article>
    `).join("");
  } catch (err) {
    newsTeaser.innerHTML = "<p>Couldn't load news right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderHome);
