function stepCardHtml(step, index) {
  return `
    <div class="step-card">
      <div class="step-number">${index + 1}</div>
      <div class="step-body">
        ${step.icon ? `<div class="step-icon">${step.icon}</div>` : ""}
        <h3>${step.title}</h3>
        <p>${step.description}</p>
      </div>
    </div>
  `;
}

async function renderHowItWorks() {
  const list = document.getElementById("steps-list");
  const ctaEl = document.getElementById("how-it-works-cta");
  const { site } = await window.__siteDataPromise;
  if (isPageDisabled(site, "how-it-works")) {
    renderPageUnavailable(list);
    return;
  }
  try {
    const res = await fetch("data/how-it-works.json", { cache: "no-store" });
    const page = await res.json();
    const steps = (page.steps || []).filter(s => s.enabled !== false);

    list.innerHTML = steps.length
      ? steps.map((s, i) => stepCardHtml(s, i)).join("")
      : "<p>The coaching process isn't listed yet.</p>";

    if (page.closingUrl) {
      ctaEl.innerHTML = `<div class="steps-cta"><a class="hero-button" href="${page.closingUrl}">${page.closingLabel || "Get started"}</a></div>`;
    }
  } catch (err) {
    list.innerHTML = "<p>Couldn't load this page right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderHowItWorks);
