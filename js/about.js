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

    const rulesHtml = about.rules.map(r => `<li>${r}</li>`).join("");

    container.innerHTML = `
      <p class="founded">Founded ${formatDate(about.founded)}</p>
      <p class="story">${about.story}</p>
      <h4 style="margin-top:28px">House Rules</h4>
      <ol class="rules-list">${rulesHtml}</ol>
    `;
  } catch (err) {
    container.innerHTML = "<p>Couldn't load this page right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderAbout);
