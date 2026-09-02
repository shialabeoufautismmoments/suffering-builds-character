import { getStore } from "@netlify/blobs";
import {
  DEFAULT_TIME_ZONE,
  clean,
  discordId,
  discordTimestamp,
  effectiveReminderSettings,
  zonedTimeToUtc,
} from "../lib/discord-bot.mjs";

const WORKSPACE_STORE = "coachsbc-workspace";
const WORKSPACE_KEY = "shared/team-workspace-v2";
const REMINDER_LOG_KEY = "shared/discord-reminder-log-v1";
const DEFAULT_OFFSETS = [1440, 60];
const DEFAULT_GRACE_MINUTES = 10;

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const env = key => clean(globalThis.Netlify?.env?.get?.(key) || process.env[key] || "", 4000);
const num = (value, fallback = 0) => Number.isFinite(+value) ? +value : fallback;

function reminderOffsets() {
  const raw = env("DISCORD_REMINDER_OFFSETS_MINUTES");
  if (!raw) return DEFAULT_OFFSETS;
  const values = raw.split(",").map(item => Math.max(1, Math.round(num(item)))).filter(Boolean);
  return values.length ? values : DEFAULT_OFFSETS;
}

function clientDiscordId(client, session) {
  return discordId(session?.discordUserId) || discordId(client?.discordId) || discordId(client?.discord);
}

function validWebhook(url) {
  return /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/i.test(clean(url, 300));
}

function offsetLabel(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

function sessionTitle(session) {
  return clean(session.title || session.topics || session.notes || "coaching session", 120);
}

export function reminderContent({ client, session, instant, offset }) {
  const mention = clientDiscordId(client, session);
  const prefix = mention ? `<@${mention}> ` : "";
  const focus = clean(session.notes || session.topics || "", 450);
  const focusLine = focus && focus !== sessionTitle(session) ? `\nFocus: ${focus}` : "";
  return `${prefix}Reminder: your ${sessionTitle(session)} is in ${offsetLabel(offset)} — ${discordTimestamp(instant)} (${discordTimestamp(instant, "R")}).${focusLine}\nIf you need to reschedule, message your coach ASAP.`;
}

async function postToDiscord({ client, session, content }) {
  const mention = clientDiscordId(client, session);
  const allowed_mentions = mention ? { parse: [], users: [mention] } : { parse: [] };
  const selectedChannel = discordId(session.discordChannelId);

  if (!selectedChannel && validWebhook(client.webhook)) {
    const response = await fetch(client.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, username: "CoachSBC Reminders", allowed_mentions }),
    });
    if (!response.ok) throw new Error(`Discord webhook returned ${response.status}.`);
    return "webhook";
  }

  const token = env("DISCORD_BOT_TOKEN");
  const channelId = selectedChannel || discordId(env("DISCORD_REMINDER_CHANNEL_ID"));
  if (!token || !channelId) throw new Error("Missing DISCORD_BOT_TOKEN or a Discord reminder channel.");

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, allowed_mentions }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord API returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  return "bot";
}

export function dueReminders(workspace, sent = {}, now = new Date(), options = {}) {
  const fallbackTimeZone = options.timeZone || workspace.settings?.timeZone || DEFAULT_TIME_ZONE;
  const defaultOffsets = options.offsets || DEFAULT_OFFSETS;
  const graceMs = Math.max(1, num(options.graceMinutes, DEFAULT_GRACE_MINUTES)) * 60_000;
  const clients = new Map((workspace.clients || []).map(client => [client.id, client]));
  const sessions = (workspace.scheduled || [])
    .filter(session => session && session.id && !session.done && session.date && session.time && session.clientId);
  const due = [];

  for (const session of sessions) {
    const client = clients.get(session.clientId);
    if (!client) continue;
    const reminderSettings = effectiveReminderSettings(client, defaultOffsets);
    if (reminderSettings.paused) continue;
    if (!clientDiscordId(client, session) && !validWebhook(client.webhook)) continue;
    const timeZone = clean(session.timeZone, 80) || fallbackTimeZone;
    const instant = zonedTimeToUtc(session.date, session.time, timeZone);
    if (!instant) continue;

    for (const offset of reminderSettings.offsets) {
      // Include the wall-clock slot so editing/rescheduling a meeting creates
      // a new reminder cycle. Preserve old id:offset log entries only for
      // legacy sessions that predate modification timestamps.
      const key = `${session.id}:${session.date}T${session.time}:${offset}`;
      const legacyKey = `${session.id}:${offset}`;
      if (sent[key] || (!session.updatedAt && sent[legacyKey])) continue;
      const target = instant.getTime() - offset * 60_000;
      const delta = now.getTime() - target;
      if (delta >= 0 && delta <= graceMs) due.push({ key, client, session, instant, offset, timeZone });
    }
  }
  return due;
}

function trimLog(log) {
  return Object.fromEntries(
    Object.entries(log || {})
      .sort((left, right) => String(right[1]).localeCompare(String(left[1])))
      .slice(0, 1000)
  );
}

async function saveReminderLog(store, current, log) {
  const options = current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
  const result = await store.setJSON(REMINDER_LOG_KEY, trimLog(log), options);
  if (result.modified) return;
  const latest = await store.getWithMetadata(REMINDER_LOG_KEY, { type: "json", consistency: "strong" });
  if (!latest?.etag) throw new Error("Could not safely save the Discord reminder log.");
  const merged = { ...(latest.data || {}), ...log };
  const retry = await store.setJSON(REMINDER_LOG_KEY, trimLog(merged), { onlyIfMatch: latest.etag });
  if (!retry.modified) throw new Error("The Discord reminder log changed repeatedly.");
}

async function runReminders({ dryRun = false } = {}) {
  const store = getStore({ name: WORKSPACE_STORE, consistency: "strong" });
  const workspace = await store.get(WORKSPACE_KEY, { type: "json", consistency: "strong" });
  if (!workspace) return { checked: 0, sent: 0, skipped: 0, errors: ["No coaching workspace has been synced yet."] };

  const logRecord = await store.getWithMetadata(REMINDER_LOG_KEY, { type: "json", consistency: "strong" });
  const legacyLog = workspace.settings?.discordReminderLog || {};
  const sentLog = { ...legacyLog, ...(logRecord?.data || {}) };
  const due = dueReminders(workspace, sentLog, new Date(), {
    timeZone: env("COACH_TIME_ZONE") || workspace.settings?.timeZone || DEFAULT_TIME_ZONE,
    offsets: reminderOffsets(),
    graceMinutes: num(env("DISCORD_REMINDER_GRACE_MINUTES"), DEFAULT_GRACE_MINUTES),
  });
  const results = [];

  for (const item of due) {
    const content = reminderContent(item);
    if (dryRun) {
      results.push({ key: item.key, client: item.client.name || item.client.id, dryRun: true, content });
      continue;
    }
    try {
      const via = await postToDiscord({ client: item.client, session: item.session, content });
      sentLog[item.key] = new Date().toISOString();
      results.push({ key: item.key, client: item.client.name || item.client.id, via });
    } catch (error) {
      results.push({ key: item.key, client: item.client.name || item.client.id, error: error.message || "Discord send failed." });
    }
  }

  if (!dryRun && results.some(result => !result.error)) await saveReminderLog(store, logRecord, sentLog);
  return {
    checked: (workspace.scheduled || []).length,
    due: due.length,
    sent: results.filter(result => !result.error).length,
    errors: results.filter(result => result.error),
    results,
  };
}

export default async request => {
  const url = new URL(request.url);
  const adminSecret = env("DISCORD_REMINDER_ADMIN_SECRET");
  const authorized = !!adminSecret && url.searchParams.get("secret") === adminSecret;
  const dryRun = url.searchParams.get("dryRun") === "1";
  if (dryRun && !authorized) return json({ error: "Dry run requires DISCORD_REMINDER_ADMIN_SECRET." }, 401);
  const result = await runReminders({ dryRun });
  if (authorized) return json(result, result.errors?.length ? 207 : 200);
  return json({ checked: result.checked, due: result.due, sent: result.sent, errorCount: result.errors?.length || 0 }, result.errors?.length ? 207 : 200);
};

export const config = { schedule: "*/5 * * * *" };
