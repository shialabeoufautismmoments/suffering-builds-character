function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "long", day: "numeric"
  });
}

async function renderSchedule() {
  const list = document.getElementById("schedule-list");
  try {
    const res = await fetch("data/schedule.json", { cache: "no-store" });
    const data = await res.json();
    const items = [...data.events].sort((a, b) => a.date.localeCompare(b.date));

    if (!items.length) {
      list.innerHTML = "<p>Nothing on the calendar yet.</p>";
      return;
    }

    const todayIso = new Date().toISOString().slice(0, 10);

    list.innerHTML = items.map(e => {
      const isPast = e.date < todayIso;
      const linkHtml = e.link
        ? `<a class="event-link" href="${e.link}" target="_blank" rel="noopener">Details</a>`
        : "";
      return `
        <article class="event-item${isPast ? " past" : ""}">
          <div class="event-date">
            <div>${formatDate(e.date)}</div>
            ${e.time ? `<div class="event-time">${e.time}</div>` : ""}
          </div>
          <div class="event-body">
            <h3>${e.title}</h3>
            ${e.game ? `<p class="event-game">${e.game}</p>` : ""}
            ${e.notes ? `<p class="event-notes">${e.notes}</p>` : ""}
            ${linkHtml}
          </div>
        </article>
      `;
    }).join("");
  } catch (err) {
    list.innerHTML = "<p>Couldn't load the schedule right now.</p>";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", renderSchedule);
