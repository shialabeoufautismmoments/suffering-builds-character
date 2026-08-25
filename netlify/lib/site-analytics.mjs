import { getStore } from "@netlify/blobs";

const analyticsStore = () => getStore({ name: "coachsbc-site-analytics", consistency: "strong" });
const clean = (value, max = 160) => String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
const dayKey = date => `day/${date}`;
const allowedEvents = new Set(["page_view", "cta_click", "application"]);

function safePath(value) {
  const path = clean(value, 180).split(/[?#]/)[0];
  return path.startsWith("/") ? path : "/";
}
function safeBucket(value, fallback = "Unknown") {
  return clean(value, 100).replace(/[<>]/g, "") || fallback;
}
function increment(target, key, event) {
  target[key] ||= { page_view: 0, cta_click: 0, application: 0 };
  target[key][event] = Number(target[key][event] || 0) + 1;
}

export async function recordSiteEvent(input = {}) {
  const event = allowedEvents.has(input.event) ? input.event : "page_view";
  const date = new Date().toISOString().slice(0, 10);
  const page = safePath(input.page);
  const source = safeBucket(input.source, "Direct");
  const campaign = safeBucket(input.campaign, "Unattributed");
  const label = safeBucket(input.label, "Unlabelled CTA");
  const store = analyticsStore();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.getWithMetadata(dayKey(date), { type: "json" });
    const record = current?.data || { date, totals: {}, pages: {}, sources: {}, campaigns: {}, ctas: {}, updatedAt: "" };
    record.totals[event] = Number(record.totals[event] || 0) + 1;
    increment(record.pages, page, event);
    increment(record.sources, source, event);
    if (campaign !== "Unattributed") increment(record.campaigns, campaign, event);
    if (event === "cta_click") increment(record.ctas, label, event);
    record.updatedAt = new Date().toISOString();
    const result = await store.setJSON(dayKey(date), record, current?.data ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result?.modified !== false) return record;
  }
  throw new Error("Analytics changed while it was being saved.");
}

function mergeBucket(target, source = {}) {
  Object.entries(source).forEach(([key, counts]) => {
    target[key] ||= { page_view: 0, cta_click: 0, application: 0 };
    Object.keys(target[key]).forEach(event => { target[key][event] += Number(counts?.[event] || 0); });
  });
}

export async function siteAnalyticsSummary(days = 90) {
  const range = Math.max(7, Math.min(365, Math.round(Number(days) || 90)));
  const start = new Date(Date.now() - (range - 1) * 86400000).toISOString().slice(0, 10);
  const store = analyticsStore();
  const listed = await store.list({ prefix: "day/" });
  const records = (await Promise.all((listed.blobs || [])
    .filter(blob => blob.key.slice(4) >= start)
    .map(blob => store.get(blob.key, { type: "json" })))).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  const summary = { days: range, start, totals: { page_view: 0, cta_click: 0, application: 0 }, pages: {}, sources: {}, campaigns: {}, ctas: {}, daily: [] };
  records.forEach(record => {
    Object.keys(summary.totals).forEach(event => { summary.totals[event] += Number(record.totals?.[event] || 0); });
    mergeBucket(summary.pages, record.pages); mergeBucket(summary.sources, record.sources);
    mergeBucket(summary.campaigns, record.campaigns); mergeBucket(summary.ctas, record.ctas);
    summary.daily.push({ date: record.date, ...record.totals });
  });
  return summary;
}
