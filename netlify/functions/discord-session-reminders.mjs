import { getStore } from "@netlify/blobs";

const WORKSPACE_STORE = "coachsbc-workspace";
const WORKSPACE_KEY = "shared/team-workspace-v2";
const DEFAULT_TIME_ZONE = "America/Winnipeg";
const DEFAULT_OFFSETS = [1440, 60];
const DEFAULT_GRACE_MINUTES = 20;

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const clean = (value, max = 1800) => String(value ?? "").trim().slice(0, max);
const env = key => clean((globalThis.Netlify?.env?.get?.(key)) || process.env[key] || "");
const num = (value, fallback = 0) => Number.isFinite(+value) ? +value : fallback;

function reminderOffsets() {
  const raw = env("DISCORD_REMINDER_OFFSETS_MINUTES");
  if (!raw) return DEFAULT_OFFSETS;
  const values = raw.split(",").map(item => Math.max(1, Math.round(num(item)))).filter(Boolean);
  return values.length ? values : DEFAULT_OFFSETS;
}

function discordId(value) {
  return /^(?:<@!?)?(\d{17,20})>?$/.exec(clean(value, 80))?.[1] || "";
}

function clientDiscordId(client) {
  return discordId(client.discordId) || discordId(client.discord);
}

function validWebhook(url) {
  return /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/i.test(clean(url, 300));
}

function wallParts(date, time) {
  const [year, month, day] = clean(date, 20).split("-").map(Number);
  const [hour, minute] = clean(time || "00:00", 20).split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { year, month, day, hour, minute };
}

function partsInTimeZone(instantMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(instantMs)).map(part => [part.type, part.value]));
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour: +parts.hour,
    minute: +parts.minute,
    second: +parts.second,
  };
}

function zonedTimeToUtc(date, time, timeZone) {
  const wall = wallParts(date, time);
  if (!wall) return null;
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  const actualWall = partsInTimeZone(guess, timeZone);
  const actualWallAsUtc = Date.UTC(
    actualWall.year,
    actualWall.month - 1,
    actualWall.day,
    actualWall.hour,
    actualWall.minute,
    actualWall.second || 0,
  );
  return new Date(guess - (actualWallAsUtc - guess));
}

function formatSessionTime(instant, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

function offsetLabel(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

function sessionTitle(session) {
  return clean(session.title || session.topics || session.notes || "Coaching session", 120);
}

function reminderContent({ client, session, instant, offset, timeZone }) {
  const mention = clientDiscordId(client);
  const prefix = mention ? `<@${mention}> ` : "";
  const focus = clean(session.notes || session.topics || "", 450);
  const sessionLine = `your ${sessionTitle(session)} is in ${offsetLabel(offset)} — ${formatSessionTime(instant, timeZone)}.`;
  const focusLine = focus ? `\nFocus: ${focus}` : "";
  return `${prefix}Reminder: ${sessionLine}${focusLine}\nIf you need to reschedule, message your coach ASAP.`;
}

async function postToDiscord({ client, content }) {
  const mention = clientDiscordId(client);
  const allowed_mentions = mention ? { parse: [], users: [mention] } : { parse: [] };

  if (validWebhook(client.webhook)) {
    const response = await fetch(client.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        username: "CoachSBC Reminders",
        allowed_mentions,
      }),
    });
    if (!response.ok) throw new Error(`Discord webhook returned ${response.status}.`);
    return "webhook";
  }

  const token = env("DISCORD_BOT_TOKEN");
  const channelId = env("DISCORD_REMINDER_CHANNEL_ID");
  if (!token || !channelId) throw new Error("Missing DISCORD_BOT_TOKEN or DISCORD_REMINDER_CHANNEL_ID.");

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, allowed_mentions }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord API returned ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return "bot";
}

function dueReminders(workspace, now = new Date()) {
  const timeZone = env("COACH_TIME_ZONE") || workspace.settings?.timeZone || DEFAULT_TIME_ZONE;
  const offsets = reminderOffsets();
  const graceMs = Math.max(1, num(env("DISCORD_REMINDER_GRACE_MINUTES"), DEFAULT_GRACE_MINUTES)) * 60_000;
  const sent = workspace.settings?.discordReminderLog || {};
  const clients = new Map((workspace.clients || []).map(client => [client.id, client]));
  const sessions = (workspace.scheduled || [])
    .filter(session => session && session.id && !session.done && session.date && session.time && session.clientId);
  const due = [];

  for (const session of sessions) {
    const client = clients.get(session.clientId);
    if (!client) continue;
    if (!clientDiscordId(client) && !validWebhook(client.webhook)) continue;

    const instant = zonedTimeToUtc(session.date, session.time, timeZone);
    if (!instant) continue;

    for (const offset of offsets) {
      const key = `${session.id}:${offset}`;
      if (sent[key]) continue;
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
      .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
      .slice(0, 500)
  );
}

async function runReminders({ dryRun = false } = {}) {
  const store = getStore({ name: WORKSPACE_STORE, consistency: "strong" });
  const workspace = await store.get(WORKSPACE_KEY, { type: "json" }) || null;
  if (!workspace) return { checked: 0, sent: 0, skipped: 0, errors: ["No coaching workspace has been synced yet."] };

  workspace.settings ||= {};
  workspace.settings.discordReminderLog ||= {};
  const due = dueReminders(workspace);
  const results = [];

  for (const item of due) {
    const content = reminderContent(item);
    if (dryRun) {
      results.push({ key: item.key, client: item.client.name || item.client.id, dryRun: true, content });
      continue;
    }
    try {
      const via = await postToDiscord({ client: item.client, content });
      workspace.settings.discordReminderLog[item.key] = new Date().toISOString();
      results.push({ key: item.key, client: item.client.name || item.client.id, via });
    } catch (error) {
      results.push({ key: item.key, client: item.client.name || item.client.id, error: error.message || "Discord send failed." });
    }
  }

  if (!dryRun && results.some(result => !result.error)) {
    workspace.settings.discordReminderLog = trimLog(workspace.settings.discordReminderLog);
    workspace.cloud = {
      ...(workspace.cloud || {}),
      revision: Number(workspace.cloud?.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(WORKSPACE_KEY, workspace);
  }

  return {
    checked: (workspace.scheduled || []).length,
    due: due.length,
    sent: results.filter(result => !result.error).length,
    errors: results.filter(result => result.error),
    results,
  };
}

export default async (request) => {
  const url = new URL(request.url);
  const adminSecret = env("DISCORD_REMINDER_ADMIN_SECRET");
  const authorized = !!adminSecret && url.searchParams.get("secret") === adminSecret;
  const dryRun = url.searchParams.get("dryRun") === "1";
  if (dryRun && !authorized) return json({ error: "Dry run requires DISCORD_REMINDER_ADMIN_SECRET." }, 401);
  const result = await runReminders({ dryRun });
  if (authorized) return json(result, result.errors?.length ? 207 : 200);
  return json({
    checked: result.checked,
    due: result.due,
    sent: result.sent,
    errorCount: result.errors?.length || 0,
  }, result.errors?.length ? 207 : 200);
};

export const config = {
  schedule: "*/15 * * * *",
};
