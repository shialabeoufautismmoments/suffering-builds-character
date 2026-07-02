function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

async function renderNews() {
  const list = document.getElementById("news-list");
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    const data = await res.json();
    const items = [...data.news].sort((a, b) => b.date.localeCompare(a.date));

    if (!items.length) {
      list.innerHTML = "<p>No announcements yet.</p>";
      return;
    }

    list.innerHTML = items.map(n => `
      <article class="news-item">
        <div class="news-date">${formatDate(n.date)}</div>
        <h3>${n.title}</h3>
        <p>${n.body}</p>
      </article>
    `).join("");
  } catch (err) {
    list.innerHTML = "<p>Couldn't load news right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderNews);
