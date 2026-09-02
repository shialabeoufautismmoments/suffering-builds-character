import { getStore } from "@netlify/blobs";
import {
  DEFAULT_TIME_ZONE,
  auditMessage,
  autocompleteChoices,
  autocompleteResponse,
  buildDiscordMatch,
  clean,
  clientMapStats,
  commandOptions,
  createMeetings,
  csvSet,
  discordId,
  discordTimestamp,
  effectiveReminderSettings,
  findClientByCode,
  findClientByDiscordId,
  formatReminderOffsets,
  interactionUserId,
  isAuthorizedStaff,
  matchLogModal,
  messageResponse,
  modalValues,
  parseReminderOffsets,
  statsEmbed,
  upcomingMeetings,
  validDate,
  validTimeZone,
  verifyDiscordRequest,
  zonedTimeToUtc,
} from "../lib/discord-bot.mjs";

const WORKSPACE_STORE = "coachsbc-workspace";
const WORKSPACE_KEY = "shared/team-workspace-v2";
const PENDING_MATCH_PREFIX = "discord/pending-match/";
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

function resolveClient(workspace, { code, userId } = {}) {
  const normalizedCode = clean(code, 80);
  const normalizedUserId = discordId(userId);
  if (!normalizedCode && !normalizedUserId) {
    return { error: "Provide either a private client code or tag a linked Discord client." };
  }
  const byCode = normalizedCode ? findClientByCode(workspace, normalizedCode) : null;
  const byUser = normalizedUserId ? findClientByDiscordId(workspace, normalizedUserId) : null;
  if (normalizedCode && !byCode) return { error: "That client code was not found." };
  if (!normalizedCode && normalizedUserId && !byUser) {
    return { error: "That Discord user is not linked to a Coach HQ client. Link their numeric Discord User ID or provide their client code." };
  }
  if (byCode && byUser && byCode.id !== byUser.id) {
    return { error: "That code and Discord user are linked to different clients. Check the selection and try again." };
  }
  return { client: byCode || byUser };
}

async function postDiscordMessage(channelId, content) {
  const token = env("DISCORD_BOT_TOKEN");
  const destination = discordId(channelId);
  if (!destination) return { ok: false, error: "DISCORD_AUDIT_CHANNEL_ID is not configured." };
  if (!token) return { ok: false, error: "DISCORD_BOT_TOKEN is not configured." };
  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${destination}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!response.ok) return { ok: false, error: `Discord rejected the audit message (${response.status}).` };
    return { ok: true };
  } catch (error) {
    console.error("Discord audit message failed:", error?.message || error);
    return { ok: false, error: "Discord could not be reached for the audit message." };
  }
}

async function postAudit(interaction, { action, clientName, details = [] }) {
  return postDiscordMessage(env("DISCORD_AUDIT_CHANNEL_ID"), auditMessage({
    action,
    actorId: interactionUserId(interaction),
    clientName,
    details,
  }));
}

function auditWarning(audit) {
  return audit.ok ? "" : `\n⚠️ Audit log warning: ${audit.error}`;
}

function defaultReminderOffsets() {
  const parsed = parseReminderOffsets(env("DISCORD_REMINDER_OFFSETS_MINUTES") || "1440,60");
  return parsed.values || [1440, 60];
}

async function handleClientStats(interaction, workspace) {
  const options = commandOptions(interaction.data?.options);
  const resolved = resolveClient(workspace, { code: options.code, userId: options.client });
  if (resolved.error) return unavailable(resolved.error);
  const stats = clientMapStats(workspace, resolved.client, options.map);
  return json(messageResponse({ embeds: [statsEmbed(stats)] }));
}

async function handleMatchLogCommand(interaction, store) {
  const workspace = await readWorkspace(store);
  if (!workspace) return unavailable("The coaching workspace has not been synced yet.");
  const options = commandOptions(interaction.data?.options);
  const resolved = resolveClient(workspace, { code: options.code, userId: options.client });
  if (resolved.error) return unavailable(resolved.error);
  const map = clean(options.map, 80);
  const result = clean(options.result, 10);
  const date = clean(options.date, 10) || new Date().toISOString().slice(0, 10);
  if (!map) return unavailable("Choose or enter a map.");
  if (!["Win", "Loss", "Draw"].includes(result)) return unavailable("Choose Win, Loss, or Draw.");
  if (!validDate(date)) return unavailable("Use a real match date in YYYY-MM-DD format.");

  const pending = {
    clientId: resolved.client.id,
    map,
    result,
    date,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
    createdByDiscordId: interactionUserId(interaction),
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  await store.setJSON(`${PENDING_MATCH_PREFIX}${interaction.id}`, pending);
  return json(matchLogModal({
    customId: `match-log:${interaction.id}`,
    clientName: resolved.client.name,
    map,
    result,
  }));
}

async function handleMatchLogModal(interaction, store) {
  const commandId = clean(interaction.data?.custom_id, 100).replace(/^match-log:/, "");
  if (!commandId || commandId === interaction.data?.custom_id) return unavailable("This match form is not recognized.");
  const pendingKey = `${PENDING_MATCH_PREFIX}${commandId}`;
  const pending = await store.get(pendingKey, { type: "json", consistency: "strong" });
  if (!pending || Number(pending.expiresAt) < Date.now()) return unavailable("This match form expired. Run /match-log again.");
  if (pending.guildId !== interaction.guild_id || pending.createdByDiscordId !== interactionUserId(interaction)) {
    return unavailable("This match form belongs to a different server or coach.");
  }

  const values = modalValues(interaction.data?.components);
  const match = buildDiscordMatch({
    id: `discord-match-${commandId}`,
    clientId: pending.clientId,
    date: pending.date,
    map: pending.map,
    result: pending.result,
    type: values.match_type,
    role: values.role,
    heroes: values.heroes,
    replayCode: values.replay_code,
    notes: values.notes,
    createdBy: interactionUserId(interaction),
  });
  if (!match) return unavailable("The match form contained invalid data. Run /match-log again.");

  const outcome = await mutateWorkspace(store, workspace => {
    const client = (workspace.clients || []).find(item => item.id === pending.clientId);
    if (!client) return { skipWrite: true, error: "That client no longer exists." };
    workspace.matches ||= [];
    const duplicate = workspace.matches.some(item => item.id === match.id);
    if (duplicate) return { skipWrite: true, duplicate: true, client };
    workspace.matches.push(match);
    return { client, match };
  });
  if (outcome.result?.error) return unavailable(outcome.result.error);
  await store.delete(pendingKey).catch(() => {});
  const { client, duplicate } = outcome.result;
  if (duplicate) return json(messageResponse({ content: "✅ That match was already logged." }));

  const audit = await postAudit(interaction, {
    action: "Match logged",
    clientName: client.name,
    details: [
      `${match.date} • ${match.map} • ${match.result}`,
      `${match.type}${match.role ? ` • ${match.role}` : ""}`,
      match.replayCode ? `Replay: ${match.replayCode}` : "",
    ],
  });
  return json(messageResponse({
    content: `✅ Logged a **${match.result}** on **${match.map}** for **${clean(client.name, 100)}**${match.role ? ` (${match.role})` : ""}.${auditWarning(audit)}`,
  }));
}

async function handleMeetingSchedule(interaction, store, options) {
  if (!env("DISCORD_BOT_TOKEN")) return unavailable("DISCORD_BOT_TOKEN is not configured on Netlify, so reminders cannot be delivered.");
  const date = clean(options.date, 10);
  const time = clean(options.time, 5);
  const repeatWeeks = Math.max(1, Math.min(52, Number(options["repeat-weeks"] || 1)));
  if (!Number.isInteger(repeatWeeks)) return unavailable("Repeat weeks must be a whole number from 1 to 52.");

  const outcome = await mutateWorkspace(store, workspace => {
    const resolved = resolveClient(workspace, { code: options.code, userId: options.client });
    if (resolved.error) return { skipWrite: true, error: resolved.error };
    const client = resolved.client;
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
  const audit = await postAudit(interaction, {
    action: "Meeting scheduled",
    clientName: client.name,
    details: [
      `${meetings[0].date} at ${meetings[0].time} (${timeZone})`,
      meetings.length > 1 ? `${meetings.length} weekly meetings` : "One-time meeting",
      `Meeting ID: ${meetings[0].id}`,
    ],
  });
  return json(messageResponse({
    content: `✅ Scheduled **${clean(client.name, 100)}** for ${discordTimestamp(instant)} (${timeZone})${series}.\nReminders will ping <@${userId}> in <#${channelId}>. First meeting ID: \`${meetings[0].id}\`${auditWarning(audit)}`,
  }));
}

async function handleMeetingList(store, options) {
  const workspace = await readWorkspace(store);
  if (!workspace) return unavailable("The coaching workspace has not been synced yet.");
  let filter = "";
  if (options.code || options.client) {
    const resolved = resolveClient(workspace, { code: options.code, userId: options.client });
    if (resolved.error) return unavailable(resolved.error);
    filter = resolved.client;
  }
  const items = upcomingMeetings(workspace, filter);
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
    return { count: targets.length, client, meeting };
  });
  if (outcome.result?.error) return unavailable(outcome.result.error);
  const { count, client, meeting } = outcome.result;
  const audit = await postAudit(interaction, {
    action: "Meeting cancelled",
    clientName: client?.name,
    details: [`${count} meeting${count === 1 ? "" : "s"}`, `Meeting ID: ${meeting.id}`],
  });
  return json(messageResponse({
    content: `✅ Cancelled ${count} meeting${count === 1 ? "" : "s"}${client ? ` for **${clean(client.name, 100)}**` : ""}. No pending reminders will be sent.${auditWarning(audit)}`,
  }));
}

async function handleMeeting(interaction, store) {
  const subcommand = interaction.data?.options?.[0];
  const options = commandOptions(subcommand?.options);
  if (subcommand?.name === "schedule") return handleMeetingSchedule(interaction, store, options);
  if (subcommand?.name === "list") return handleMeetingList(store, options);
  if (subcommand?.name === "cancel") return handleMeetingCancel(interaction, store, options);
  return unavailable("Unknown meeting subcommand.");
}

async function handleReminders(interaction, store) {
  const subcommand = interaction.data?.options?.[0];
  const options = commandOptions(subcommand?.options);
  if (!["set", "status", "pause", "resume"].includes(subcommand?.name)) return unavailable("Unknown reminders subcommand.");

  if (subcommand.name === "status") {
    const workspace = await readWorkspace(store);
    if (!workspace) return unavailable("The coaching workspace has not been synced yet.");
    const resolved = resolveClient(workspace, { code: options.code, userId: options.client });
    if (resolved.error) return unavailable(resolved.error);
    const settings = effectiveReminderSettings(resolved.client, defaultReminderOffsets());
    return json(messageResponse({
      content: `🔔 **${clean(resolved.client.name, 100)}** reminders are **${settings.paused ? "paused" : "active"}**.\nOffsets: **${formatReminderOffsets(settings.offsets)}**${settings.customized ? " (client-specific)" : " (server default)"}.`,
    }));
  }

  const parsed = subcommand.name === "set" ? parseReminderOffsets(options.offsets) : null;
  if (parsed?.error) return unavailable(parsed.error);
  const outcome = await mutateWorkspace(store, workspace => {
    const resolved = resolveClient(workspace, { code: options.code, userId: options.client });
    if (resolved.error) return { skipWrite: true, error: resolved.error };
    const client = resolved.client;
    const existing = client.discordReminderSettings || {};
    const now = new Date().toISOString();
    client.discordReminderSettings = {
      ...existing,
      ...(subcommand.name === "set" ? { offsetsMinutes: parsed.values } : {}),
      ...(subcommand.name === "pause" ? { paused: true } : {}),
      ...(subcommand.name === "resume" ? { paused: false } : {}),
      updatedAt: now,
      updatedByDiscordId: interactionUserId(interaction),
    };
    client.updatedAt = now;
    return { client, settings: effectiveReminderSettings(client, defaultReminderOffsets()) };
  });
  if (outcome.result?.error) return unavailable(outcome.result.error);

  const { client, settings } = outcome.result;
  const action = subcommand.name === "set"
    ? "Reminder schedule changed"
    : subcommand.name === "pause"
      ? "Reminders paused"
      : "Reminders resumed";
  const audit = await postAudit(interaction, {
    action,
    clientName: client.name,
    details: [`Offsets: ${formatReminderOffsets(settings.offsets)}`, `State: ${settings.paused ? "paused" : "active"}`],
  });
  return json(messageResponse({
    content: `✅ **${clean(client.name, 100)}** reminders are now **${settings.paused ? "paused" : "active"}** at **${formatReminderOffsets(settings.offsets)}** before each meeting.${auditWarning(audit)}`,
  }));
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

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  if (interaction.type === 1) return json({ type: 1 });
  if (![2, 4, 5].includes(interaction.type)) return unavailable("This interaction type is not supported.");

  const guildId = env("DISCORD_GUILD_ID");
  const authorized = guildId && isAuthorizedStaff(interaction, {
    guildId,
    roleIds: csvSet(env("DISCORD_STAFF_ROLE_IDS")),
    userIds: csvSet(env("DISCORD_STAFF_USER_IDS")),
  });
  if (interaction.type === 4 && !authorized) return json(autocompleteResponse([]));
  if (!guildId) return unavailable("DISCORD_GUILD_ID is not configured on Netlify.");
  if (!authorized) return unavailable("This command is limited to configured coaching staff.");

  try {
    const store = workspaceStore();
    if (interaction.type === 4) {
      const workspace = await readWorkspace(store);
      return json(autocompleteResponse(workspace ? autocompleteChoices(workspace, interaction) : []));
    }
    if (interaction.type === 5) {
      if (clean(interaction.data?.custom_id, 100).startsWith("match-log:")) return handleMatchLogModal(interaction, store);
      return unavailable("Unknown form submission.");
    }
    if (interaction.data?.name === "client-stats") {
      const workspace = await readWorkspace(store);
      if (!workspace) return unavailable("The coaching workspace has not been synced yet.");
      return handleClientStats(interaction, workspace);
    }
    if (interaction.data?.name === "match-log") return handleMatchLogCommand(interaction, store);
    if (interaction.data?.name === "meeting") return handleMeeting(interaction, store);
    if (interaction.data?.name === "reminders") return handleReminders(interaction, store);
    return unavailable("Unknown command. Re-register the Discord commands and try again.");
  } catch (error) {
    console.error("Discord interaction failed:", error?.message || error);
    return unavailable(error?.message || "The command could not be completed.");
  }
};

export const config = { path: "/api/discord" };
