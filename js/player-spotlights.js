const ResultsLibrary = { items: [] };

function resultInitials(name) {
  return String(name || "?").replace(/"[^"]*"/g, "").trim().split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();
}

function resultAvatar(item) {
  return item.photo
    ? `<img class="results-avatar" src="${escapeSiteHtml(item.photo)}" alt="${escapeSiteHtml(item.playerName)}" />`
    : `<div class="results-avatar results-avatar-fallback">${escapeSiteHtml(resultInitials(item.playerName))}</div>`;
}

function resultFocusAreas(item) {
  return String(item.focusAreas || "").split("\n").map(value => value.trim()).filter(Boolean);
}

function resultOptions(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(value => `<option value="${escapeSiteHtml(value)}">${escapeSiteHtml(value)}</option>`).join("");
}

function resultCard(item) {
  const focus = resultFocusAreas(item);
  return `<a class="result-card${item.featured ? " featured" : ""}" href="player-spotlight.html?slug=${encodeURIComponent(item.slug)}">
    ${item.featured ? '<span class="result-featured">Featured result</span>' : ""}
    <div class="result-card-head">${resultAvatar(item)}<div><h3>${escapeSiteHtml(item.playerName)}</h3><p>${escapeSiteHtml([item.game, item.coachingType].filter(Boolean).join(" · "))}</p></div></div>
    ${(item.startingPoint || item.result) ? `<div class="result-arc"><span><small>Starting point</small>${escapeSiteHtml(item.startingPoint || "—")}</span><b aria-hidden="true">→</b><span><small>Result</small>${escapeSiteHtml(item.result || "—")}</span></div>` : ""}
    ${item.summary ? `<p class="result-summary">${escapeSiteHtml(item.summary)}</p>` : ""}
    <div class="result-tags">${item.timeframe ? `<span>${escapeSiteHtml(item.timeframe)}</span>` : ""}${focus.slice(0, 3).map(area => `<span>${escapeSiteHtml(area)}</span>`).join("")}</div>
    <span class="result-link">Read the full case study →</span>
  </a>`;
}

function renderResultCards() {
  const grid = document.getElementById("spotlights-grid");
  const count = document.getElementById("results-count");
  const query = document.getElementById("results-search").value.trim().toLowerCase();
  const game = document.getElementById("results-game").value;
  const type = document.getElementById("results-type").value;
  const focus = document.getElementById("results-focus").value;
  const filtered = ResultsLibrary.items.filter(item => {
    const haystack = [item.playerName, item.summary, item.game, item.coachingType, item.coaches, item.startingPoint, item.result, item.focusAreas].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (!game || item.game === game) && (!type || item.coachingType === type) && (!focus || resultFocusAreas(item).includes(focus));
  });
  count.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
  grid.innerHTML = filtered.length ? filtered.map(resultCard).join("") : '<div class="results-empty">No results match those filters.</div>';
}

async function renderSpotlights() {
  const grid = document.getElementById("spotlights-grid");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "spotlights")) {
    renderPageUnavailable(grid);
    return;
  }
  try {
    const response = await fetch("data/spotlights.json", { cache: "no-store" });
    const data = await response.json();
    ResultsLibrary.items = (data.spotlights || [])
      .filter(item => item.enabled !== false && item.consentConfirmed === true)
      .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || String(b.publishedDate || "").localeCompare(String(a.publishedDate || "")));
    document.getElementById("results-game").insertAdjacentHTML("beforeend", resultOptions(ResultsLibrary.items.map(item => item.game)));
    document.getElementById("results-type").insertAdjacentHTML("beforeend", resultOptions(ResultsLibrary.items.map(item => item.coachingType)));
    document.getElementById("results-focus").insertAdjacentHTML("beforeend", resultOptions(ResultsLibrary.items.flatMap(resultFocusAreas)));
    ["results-search", "results-game", "results-type", "results-focus"].forEach(id => {
      const control = document.getElementById(id);
      control.addEventListener(id === "results-search" ? "input" : "change", renderResultCards);
    });
    renderResultCards();
  } catch (error) {
    grid.innerHTML = "<p>Couldn't load player results right now.</p>";
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", renderSpotlights);
