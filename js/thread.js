function renderMissingThread(container, titleEl, message) {
  container.innerHTML = `
    <p>${message}</p>
    <p><a class="back-link" href="threads.html">&larr; Back to Threads</a></p>
  `;
  if (titleEl) titleEl.textContent = "";
  document.title = "Thread Not Found — Suffering Builds Character";
}

function tweetIdFromUrl(url) {
  const match = url.match(/status(?:es)?\/(\d+)/);
  return match ? match[1] : null;
}

async function renderThread() {
  const slug = new URLSearchParams(window.location.search).get("slug");
  const container = document.getElementById("thread-content");
  const titleEl = document.getElementById("thread-title");

  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "threads")) {
    renderPageUnavailable(container);
    return;
  }

  let thread;
  try {
    const res = await fetch("data/threads.json", { cache: "no-store" });
    const data = await res.json();
    thread = data.threads.find(t => t.slug === slug);
  } catch (err) {
    renderMissingThread(container, titleEl, "Couldn't load this thread right now.");
    console.error(err);
    return;
  }

  if (!thread || thread.enabled === false) {
    renderMissingThread(container, titleEl, "That thread doesn't exist.");
    return;
  }

  setMetaTags({
    title: `${thread.title} — Suffering Builds Character`,
    description: `"${thread.title}" — an unrolled Twitter/X thread from Suffering Builds Character.`
  });
  if (titleEl) titleEl.textContent = thread.title;

  const urls = (thread.tweetUrls || "")
    .split("\n")
    .map(u => u.trim())
    .filter(Boolean);
  if (!urls.length) {
    container.innerHTML = "<p>No tweets added to this thread yet.</p>";
    return;
  }

  container.innerHTML = "";
  window.twttr.ready(twttr => {
    urls.forEach(url => {
      const id = tweetIdFromUrl(url);
      const wrapper = document.createElement("div");
      wrapper.className = "tweet-embed";
      container.appendChild(wrapper);

      if (!id) {
        wrapper.innerHTML = `<p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
        return;
      }

      twttr.widgets.createTweet(id, wrapper, { theme: "dark" }).then(el => {
        if (!el) {
          wrapper.innerHTML = `<p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
        }
      }).catch(() => {
        wrapper.innerHTML = `<p><a href="${url}" target="_blank" rel="noopener">${url}</a></p>`;
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", renderThread);
