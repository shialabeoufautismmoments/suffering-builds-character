function renderMissingNotes(container, message) {
  container.innerHTML = `
    <p>${message}</p>
    <p><a class="back-link" href="reading.html">&larr; Back to Reading</a></p>
  `;
}

async function renderNotes() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  const container = document.getElementById("notes-content");

  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "reading")) {
    renderPageUnavailable(container);
    return;
  }

  let book;
  try {
    const res = await fetch("data/books.json", { cache: "no-store" });
    const data = await res.json();
    book = data.books.find(b => b.slug === slug);
  } catch (err) {
    renderMissingNotes(container, "Couldn't load these notes right now.");
    console.error(err);
    return;
  }

  if (!book || book.enabled === false || !book.notes) {
    renderMissingNotes(container, "Those notes don't exist.");
    document.title = "Notes Not Found — Suffering Builds Character";
    return;
  }

  document.title = `Notes: ${book.title} — Suffering Builds Character`;

  const notesHtml = book.notes
    .split(/\n\s*\n/)
    .filter(p => p.trim())
    .map(p => `<p class="story">${p.trim()}</p>`)
    .join("");

  container.innerHTML = `
    <h2 style="margin-top:0">${book.title}</h2>
    ${book.author ? `<p class="founded">${book.author}</p>` : ""}
    ${notesHtml}
  `;
}

document.addEventListener("DOMContentLoaded", renderNotes);
