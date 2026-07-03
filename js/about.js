function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

async function renderAbout() {
  const container = document.getElementById("about-content");
  try {
    const res = await fetch("data/about.json", { cache: "no-store" });
    const about = await res.json();

    container.innerHTML = `
      <p class="founded">Founded ${formatDate(about.founded)}</p>
      <p class="story">${about.story}</p>
    `;
  } catch (err) {
    container.innerHTML = "<p>Couldn't load this page right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderAbout);
