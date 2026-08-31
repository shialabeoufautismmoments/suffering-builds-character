import { getStore } from "@netlify/blobs";
import {
  DEFAULT_TIME_ZONE,
  clean,
  commandOptions,
  createMeetings,
  csvSet,
  discordId,
  discordTimestamp,
  findClientByCode,
  interactionUserId,
  isAuthorizedStaff,
  messageResponse,
  statsEmbed,
  clientMapStats,
  upcomingMeetings,
  validTimeZone,
  verifyDiscordRequest,
  zonedTimeToUtc,
} from "../lib/discord-bot.mjs";

const WORKSPACE_STORE = "coachsbc-workspace";
const WORKSPACE_KEY = "shared/team-workspace-v2";
const APPLICATION_PUBLIC_KEY = "f4a732ae0b047c1d622b70e603ee13a63320855cc71a5203edb36c60f4fe51dc";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});
const env = key => clean(globalThis.Netlify?.env?.get?.(key) || process.env[key] || "", 4000);
const workspaceStore = () => getStore({ name: WORKSPACE_STORE, consistency: "strong" });

async function readWorkspace(store) {
  return store.get(WORKSPACE_KEY, { type: "json", consistency: "strong" });
}

async function mutateWorkspace(store, mutate, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const current = await store.getWithMetadata(WORKSPACE_KEY, { type: "json", consistency: "strong" });
    if (!current?.data) throw new Error("The coaching workspace has not been synced yet.");
    if (!current.etag) throw new Error("The workspace could not be locked for a safe update.");

    const result = await mutate(current.data);
    if (result?.skipWrite) return { workspace: current.data, result };
    const now = new Date().toISOString();
    current.data.cloud = {
      ...(current.data.cloud || {}),
      revision: Number(current.data.cloud?.revision || 0) + 1,
      updatedAt: now,
    };
    const write = await store.setJSON(WORKSPACE_KEY, current.data, { onlyIfMatch: current.etag });
    if (write.modified) return { workspace: current.data, result };
  }
  throw new Error("The workspace changed repeatedly. Run the command again.");
}

function unavailable(message) {
  return json(messageResponse({ content: `⚠️ ${message}` }));
}

function formatMeetingList(items) {
  if (!items.length) return "No upcoming meetings found.";
  const lines = [];
  for (const { meeting, client, instant, timeZone } of items.slice(0, 15)) {
    const who = clean(client?.name, 80) || "Unknown client";
    const line = `• **${who}** — ${discordTimestamp(instant)} (${timeZone})\n  ID: \`${meeting.id}\`${meeting.notes ? ` · ${clean(meeting.notes, 180)}` : ""}`;
    if ([...lines, line].join("\n").length > 1850) break;
    lines.push(line);
  }
  const remaining = items.length - lines.length;
  return `${lines.join("\n")}${remaining > 0 ? `\n…and ${remaining} more.` : ""}`;
}

async function handleClientStats(interaction, workspace) {
  const options = commandOptions(interaction.data?.options);
  const stats = clientMapStats(workspace, options.code, options.map);
  if (!stats) return unavailable("That client code was not found.");
  return json(messageResponse({ embeds: [statsEmbed(stats)] }));
}

async function handleMeetingSchedule(interaction, store, options) {
  if (!env("DISCORD_BOT_TOKEN")) return unavailable("DISCORD_BOT_TOKEN is not configured on Netlify, so reminders cannot be delivered.");
  const code = options.code;
  const date = clean(options.date, 10);
  const time = clean(options.time, 5);
  const repeatWeeks = Math.max(1, Math.min(52, Number(options["repeat-weeks"] || 1)));
  if (!Number.isInteger(repeatWeeks)) return unavailable("Repeat weeks must be a whole number from 1 to 52.");

  const outcome = await mutateWorkspace(store, workspace => {
    const client = findClientByCode(workspace, code);
    if (!client) return { skipWrite: true, error: "That client code was not found." };
    const timeZone = clean(options.timezone, 80)
      || env("COACH_TIME_ZONE")
      || clean(workspace.settings?.timeZone, 80)
      || DEFAULT_TIME_ZONE;
    if (!validTimeZone(timeZone)) return { skipWrite: true, error: "Use a valid IANA timezone such as America/Winnipeg." };
    const instant = zonedTimeToUtc(date, time, timeZone);
    if (!instant) return { skipWrite: true, error: "Use a real date (YYYY-MM-DD) and 24-hour time (HH:MM). The selected time must exist in that timezone." };
    if (instant.getTime() <= Date.now()) return { skipWrite: true, error: "The first meeting must be in the future." };

    const channelId = discordId(options.channel || interaction.channel_id || env("DISCORD_REMINDER_CHANNEL_ID"));
    if (!channelId) return { skipWrite: true, error: "Choose a Discord reminder channel or configure DISCORD_REMINDER_CHANNEL_ID." };
    const userId = discordId(options.client || client.discordId || client.discord);
    if (!userId) return { skipWrite: true, error: "Choose the Discord client to ping, or link a numeric Discord User ID in Coach HQ." };

    const meetings = createMeetings({
      clientId: client.id,
      date,
      time,
      timeZone,
      notes: options.notes,
      repeatWeeks,
      channelId,
      userId,
      createdBy: interactionUserId(interaction),
    });
    workspace.scheduled ||= [];
    workspace.scheduled.push(...meetings);
    return { meetings, client, instant, timeZone, channelId, userId };
  });

  if (outcome.result?.error) return unavailable(outcome.result.error);
  const { meetings, client, instant, timeZone, channelId, userId } = outcome.result;
  const series = meetings.length > 1 ? ` and ${meetings.length - 1} weekly repeat${meetings.length === 2 ? "" : "s"}` : "";
  return json(messageResponse({
    content: `✅ Scheduled **${clean(client.name, 100)}** for ${discordTimestamp(instant)} (${timeZone})${series}.\nReminders will ping <@${userId}> in <#${channelId}>. First meeting ID: \`${meetings[0].id}\``,
  }));
}

async function handleMeetingList(store, options) {
  const workspace = await readWorkspace(store);
  if (!workspace) return unavailable("The coaching workspace has not been synced yet.");
  const items = upcomingMeetings(workspace, options.code);
  if (items === null) return unavailable("That client code was not found.");
  return json(messageResponse({ content: formatMeetingList(items) }));
}

async function handleMeetingCancel(interaction, store, options) {
  const meetingId = clean(options["meeting-id"], 100);
  const cancelSeries = options.series === true;
  const outcome = await mutateWorkspace(store, workspace => {
    const meeting = (workspace.scheduled || []).find(item => item.id === meetingId);
    if (!meeting) return { skipWrite: true, error: "That meeting ID was not found." };
    const targets = cancelSeries && meeting.recurId
      ? workspace.scheduled.filter(item => item.recurId === meeting.recurId && !item.done)
      : [meeting];
    const now = new Date().toISOString();
    targets.forEach(item => Object.assign(item, {
      done: true,
      cancelled: true,
      cancelledByDiscordId: interactionUserId(interaction),
      cancelledAt: now,
      updatedAt: now,
    }));
    const client = (workspace.clients || []).find(item => item.id === meeting.clientId);
    return { count: targets.length, client };
  });
  if (outcome.result?.error) return unavailable(outcome.result.error);
  const { count, client } = outcome.result;
  return json(messageResponse({ content: `✅ Cancelled ${count} meeting${count === 1 ? "" : "s"}${client ? ` for **${clean(client.name, 100)}**` : ""}. No pending reminders will be sent.` }));
}

async function handleMeeting(interaction, store) {
  const subcommand = interaction.data?.options?.[0];
  const options = commandOptions(subcommand?.options);
  if (subcommand?.name === "schedule") return handleMeetingSchedule(interaction, store, options);
  if (subcommand?.name === "list") return handleMeetingList(store, options);
  if (subcommand?.name === "cancel") return handleMeetingCancel(interaction, store, options);
  return unavailable("Unknown meeting subcommand.");
}

export default async request => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature-ed25519") || "";
  const timestamp = request.headers.get("x-signature-timestamp") || "";
  const publicKey = env("DISCORD_PUBLIC_KEY") || APPLICATION_PUBLIC_KEY;
  if (!verifyDiscordRequest({ publicKey, signature, timestamp, body: rawBody })) {
    return json({ error: "Invalid Discord request signature." }, 401);
  }

  const interaction = JSON.parse(rawBody);
  if (interaction.type === 1) return json({ type: 1 });
  if (interaction.type !== 2) return unavailable("This interaction type is not supported.");

  const guildId = env("DISCORD_GUILD_ID");
  if (!guildId) return unavailable("DISCORD_GUILD_ID is not configured on Netlify.");
  if (!isAuthorizedStaff(interaction, {
    guildId,
    roleIds: csvSet(env("DISCORD_STAFF_ROLE_IDS")),
    userIds: csvSet(env("DISCORD_STAFF_USER_IDS")),
  })) {
    return unavailable("This command is limited to configured coaching staff.");
  }

  try {
    const store = workspaceStore();
    if (interaction.data?.name === "client-stats") {
      const workspace = await readWorkspace(store);
      if (!workspace) return unavailable("The coaching workspace has not been synced yet.");
      return handleClientStats(interaction, workspace);
    }
    if (interaction.data?.name === "meeting") return handleMeeting(interaction, store);
    return unavailable("Unknown command. Re-register the Discord commands and try again.");
  } catch (error) {
    console.error("Discord interaction failed:", error?.message || error);
    return unavailable(error?.message || "The command could not be completed.");
  }
};

export const config = { path: "/api/discord" };
