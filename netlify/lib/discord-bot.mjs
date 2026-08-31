import { createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";

export const DISCORD_EPHEMERAL_FLAG = 64;
export const DEFAULT_TIME_ZONE = "America/Winnipeg";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;

export const DISCORD_COMMANDS = [
  {
    name: "client-stats",
    description: "View a client's match record and map win rates",
    type: 1,
    contexts: [0],
    integration_types: [0],
    default_member_permissions: String(MANAGE_GUILD),
    options: [
      {
        type: 3,
        name: "code",
        description: "The private client code from Coach HQ",
        required: true,
        min_length: 4,
        max_length: 80,
      },
      {
        type: 3,
        name: "map",
        description: "Optional map name to filter the report",
        required: false,
        max_length: 120,
      },
    ],
  },
  {
    name: "meeting",
    description: "Schedule and manage client meeting reminders",
    type: 1,
    contexts: [0],
    integration_types: [0],
    default_member_permissions: String(MANAGE_GUILD),
    options: [
      {
        type: 1,
        name: "schedule",
        description: "Schedule one or more weekly client meetings",
        options: [
          { type: 3, name: "code", description: "The private client code", required: true, min_length: 4, max_length: 80 },
          { type: 3, name: "date", description: "First date in YYYY-MM-DD format", required: true, min_length: 10, max_length: 10 },
          { type: 3, name: "time", description: "Start time in 24-hour HH:MM format", required: true, min_length: 5, max_length: 5 },
          { type: 6, name: "client", description: "Discord member to ping (uses the linked client account if omitted)", required: false },
          { type: 7, name: "channel", description: "Reminder channel (defaults to the current channel)", required: false, channel_types: [0, 5, 10, 11, 12] },
          { type: 4, name: "repeat-weeks", description: "Number of weekly meetings, from 1 to 52", required: false, min_value: 1, max_value: 52 },
          { type: 3, name: "timezone", description: "IANA timezone, for example America/Winnipeg", required: false, max_length: 80 },
          { type: 3, name: "notes", description: "Meeting focus or notes", required: false, max_length: 500 },
        ],
      },
      {
        type: 1,
        name: "list",
        description: "List upcoming meetings",
        options: [
          { type: 3, name: "code", description: "Optional private client code", required: false, min_length: 4, max_length: 80 },
        ],
      },
      {
        type: 1,
        name: "cancel",
        description: "Cancel a meeting so no reminder is sent",
        options: [
          { type: 3, name: "meeting-id", description: "Meeting ID shown by /meeting list", required: true, max_length: 100 },
          { type: 5, name: "series", description: "Cancel the full repeating series", required: false },
        ],
      },
    ],
  },
];

export const clean = (value, max = 1800) => String(value ?? "").trim().slice(0, max);
export const normalizeCode = value => clean(value, 80).toUpperCase();
export const discordId = value => /^(?:<@!?)?(\d{17,20})>?$/.exec(clean(value, 80))?.[1] || "";

export function csvSet(value) {
  return new Set(clean(value, 2000).split(",").map(item => item.trim()).filter(Boolean));
}

export function verifyDiscordRequest({ publicKey, signature, timestamp, body, now = Date.now() }) {
  try {
    if (!/^[a-f\d]{64}$/i.test(clean(publicKey, 80))) return false;
    if (!/^[a-f\d]{128}$/i.test(clean(signature, 140))) return false;
    if (!/^\d{10,16}$/.test(clean(timestamp, 20))) return false;
    const requestMs = Number(timestamp) * 1000;
    if (!Number.isFinite(requestMs) || Math.abs(now - requestMs) > 5 * 60_000) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return verifySignature(
      null,
      Buffer.from(`${timestamp}${body}`),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

export function interactionUserId(interaction) {
  return clean(interaction?.member?.user?.id || interaction?.user?.id, 30);
}

export function isAuthorizedStaff(interaction, { guildId, roleIds = new Set(), userIds = new Set() }) {
  if (!guildId || clean(interaction?.guild_id, 30) !== clean(guildId, 30)) return false;
  const userId = interactionUserId(interaction);
  if (userIds.has(userId)) return true;
  if ((interaction?.member?.roles || []).some(roleId => roleIds.has(String(roleId)))) return true;
  try {
    const permissions = BigInt(interaction?.member?.permissions || "0");
    return !!(permissions & ADMINISTRATOR) || !!(permissions & MANAGE_GUILD);
  } catch {
    return false;
  }
}

export function commandOptions(options = []) {
  return Object.fromEntries((options || []).map(option => [option.name, option.value]));
}

export function findClientByCode(workspace, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return (workspace?.clients || []).find(client => normalizeCode(client.clientCode) === normalized) || null;
}

function record(matches) {
  const wins = matches.filter(match => clean(match.result, 20).toLowerCase() === "win").length;
  const losses = matches.filter(match => clean(match.result, 20).toLowerCase() === "loss").length;
  const draws = matches.filter(match => clean(match.result, 20).toLowerCase() === "draw").length;
  const decisive = wins + losses;
  return {
    wins,
    losses,
    draws,
    total: matches.length,
    decisive,
    winRate: decisive ? Math.round((wins / decisive) * 100) : null,
  };
}

export function clientMapStats(workspace, code, mapFilter = "") {
  const client = findClientByCode(workspace, code);
  if (!client) return null;
  const matches = (workspace.matches || []).filter(match => match.clientId === client.id);
  const groups = new Map();
  for (const match of matches) {
    const name = clean(match.map, 120);
    if (!name) continue;
    const key = name.toLocaleLowerCase("en-US");
    const group = groups.get(key) || { name, mode: clean(match.mode, 80), matches: [] };
    if (!group.mode && match.mode) group.mode = clean(match.mode, 80);
    group.matches.push(match);
    groups.set(key, group);
  }

  const filter = clean(mapFilter, 120).toLocaleLowerCase("en-US");
  let maps = [...groups.values()].map(group => ({ ...group, ...record(group.matches) }));
  if (filter) {
    const exact = maps.filter(map => map.name.toLocaleLowerCase("en-US") === filter);
    maps = exact.length ? exact : maps.filter(map => map.name.toLocaleLowerCase("en-US").includes(filter));
  }
  maps.sort((left, right) =>
    (right.winRate ?? -1) - (left.winRate ?? -1)
      || right.total - left.total
      || left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );

  return {
    client,
    overall: record(matches),
    maps,
    mapFilter: clean(mapFilter, 120),
  };
}

function recordText(value) {
  const rate = value.winRate == null ? "—" : `${value.winRate}%`;
  return `${value.wins}-${value.losses}-${value.draws} W-L-D · ${rate} win rate · ${value.total} match${value.total === 1 ? "" : "es"}`;
}

function mapLines(stats) {
  return stats.maps.map(map => {
    const mode = map.mode ? ` (${map.mode})` : "";
    return `**${map.name}**${mode} — ${recordText(map)}`;
  });
}

function fieldChunks(lines, maxLength = 1000) {
  const chunks = [];
  let current = "";
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function statsEmbed(stats) {
  const client = stats.client;
  const fields = [
    { name: "Overall logged record", value: recordText(stats.overall), inline: false },
  ];
  const tracker = client.trackerStats;
  if (tracker && (tracker.winRate != null || tracker.matches != null)) {
    fields.push({
      name: "Profile snapshot",
      value: [tracker.winRate != null ? `${tracker.winRate}% win rate` : "", tracker.matches != null ? `${tracker.matches} games` : ""].filter(Boolean).join(" · "),
      inline: false,
    });
  }

  const lines = mapLines(stats);
  if (!lines.length) {
    fields.push({
      name: stats.mapFilter ? "Map filter" : "Maps",
      value: stats.mapFilter ? `No logged map matched “${stats.mapFilter}”.` : "No matches with map data have been logged yet.",
      inline: false,
    });
  } else {
    const chunks = fieldChunks(lines);
    chunks.slice(0, 5).forEach((value, index) => fields.push({
      name: index ? "Maps (continued)" : stats.mapFilter ? `Maps matching “${stats.mapFilter}”` : "Map breakdown",
      value,
      inline: false,
    }));
    if (chunks.length > 5) fields.push({ name: "More maps", value: "Additional map rows were omitted to fit Discord's embed limit.", inline: false });
  }

  return {
    title: `${clean(client.name, 120) || "Client"} — map stats`,
    description: [clean(client.game, 80), clean(client.rank, 80)].filter(Boolean).join(" · ") || undefined,
    color: 0xe8833a,
    fields,
    footer: { text: "Draws are excluded from win-rate calculations." },
    timestamp: new Date().toISOString(),
  };
}

function dateParts(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(date, 10));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  if (instant.getUTCFullYear() !== year || instant.getUTCMonth() !== month - 1 || instant.getUTCDate() !== day) return null;
  return { year, month, day };
}

function timeParts(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(clean(time, 5));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

export function validTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return !!clean(timeZone, 80);
  } catch {
    return false;
  }
}

export function partsInTimeZone(instantMs, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US-u-hc-h23", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instantMs)).map(part => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function zonedTimeToUtc(date, time, timeZone) {
  const day = dateParts(date);
  const clock = timeParts(time);
  if (!day || !clock || !validTimeZone(timeZone)) return null;
  const desiredAsUtc = Date.UTC(day.year, day.month - 1, day.day, clock.hour, clock.minute, 0);
  let candidate = desiredAsUtc;
  for (let index = 0; index < 3; index++) {
    const actual = partsInTimeZone(candidate, timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    const delta = desiredAsUtc - actualAsUtc;
    candidate += delta;
    if (!delta) break;
  }
  const final = partsInTimeZone(candidate, timeZone);
  if (final.year !== day.year || final.month !== day.month || final.day !== day.day || final.hour !== clock.hour || final.minute !== clock.minute) return null;
  return new Date(candidate);
}

export function addDays(date, amount) {
  const parts = dateParts(date);
  if (!parts) return "";
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return value.toISOString().slice(0, 10);
}

export function createMeetings({ clientId, date, time, timeZone, notes = "", repeatWeeks = 1, channelId, userId, createdBy }) {
  const recurId = repeatWeeks > 1 ? `discord-series-${randomUUID()}` : null;
  const createdAt = new Date().toISOString();
  return Array.from({ length: repeatWeeks }, (_, index) => ({
    id: `discord-${Date.now().toString(36)}-${index + 1}-${randomUUID().slice(0, 8)}`,
    clientId,
    date: addDays(date, index * 7),
    time,
    timeZone,
    notes: clean(notes, 500),
    done: false,
    recurId,
    source: "discord",
    discordChannelId: discordId(channelId),
    discordUserId: discordId(userId),
    createdByDiscordId: discordId(createdBy),
    createdAt,
    updatedAt: createdAt,
  }));
}

export function discordTimestamp(instant, style = "F") {
  return `<t:${Math.floor(new Date(instant).getTime() / 1000)}:${style}>`;
}

export function upcomingMeetings(workspace, code = "", now = new Date()) {
  const client = code ? findClientByCode(workspace, code) : null;
  if (code && !client) return null;
  const clients = new Map((workspace.clients || []).map(item => [item.id, item]));
  const fallbackZone = clean(workspace.settings?.timeZone, 80) || DEFAULT_TIME_ZONE;
  return (workspace.scheduled || [])
    .filter(meeting => !meeting.done && (!client || meeting.clientId === client.id))
    .map(meeting => {
      const timeZone = clean(meeting.timeZone, 80) || fallbackZone;
      return { meeting, client: clients.get(meeting.clientId), instant: zonedTimeToUtc(meeting.date, meeting.time, timeZone), timeZone };
    })
    .filter(item => item.instant && item.instant.getTime() >= now.getTime())
    .sort((left, right) => left.instant - right.instant);
}

export function messageResponse({ content = "", embeds, ephemeral = true }) {
  return {
    type: 4,
    data: {
      content,
      ...(embeds?.length ? { embeds } : {}),
      ...(ephemeral ? { flags: DISCORD_EPHEMERAL_FLAG } : {}),
      allowed_mentions: { parse: [] },
    },
  };
}
