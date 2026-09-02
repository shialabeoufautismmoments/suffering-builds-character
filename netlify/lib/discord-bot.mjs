import { createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";
import { OVERWATCH_CATALOG } from "../../apps/shared/overwatch-catalog.mjs";

export const DISCORD_EPHEMERAL_FLAG = 64;
export const DEFAULT_TIME_ZONE = "America/Winnipeg";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const OW_MAP_NAMES = OVERWATCH_CATALOG.maps.map(map => map.name);
const OW_MAP_MODE = Object.fromEntries(OVERWATCH_CATALOG.maps.map(map => [map.name, map.mode]));
const OW_HERO_NAMES = OVERWATCH_CATALOG.heroes.map(hero => hero.name);
const OW_ROLES = ["Tank", "Damage", "Support"];
const MATCH_TYPES = ["Competitive", "Scrim", "Quick Play", "Custom", "Tournament"];

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
        required: false,
        min_length: 4,
        max_length: 80,
        autocomplete: true,
      },
      {
        type: 6,
        name: "client",
        description: "Linked Discord client (use this or the private client code)",
        required: false,
      },
      {
        type: 3,
        name: "map",
        description: "Optional map name to filter the report",
        required: false,
        max_length: 120,
        autocomplete: true,
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
          { type: 3, name: "date", description: "First date in YYYY-MM-DD format", required: true, min_length: 10, max_length: 10 },
          { type: 3, name: "time", description: "Start time in 24-hour HH:MM format", required: true, min_length: 5, max_length: 5 },
          { type: 3, name: "code", description: "Private client code (use this or a linked Discord client)", required: false, min_length: 4, max_length: 80, autocomplete: true },
          { type: 6, name: "client", description: "Discord client to look up and ping", required: false },
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
          { type: 3, name: "code", description: "Optional private client code", required: false, min_length: 4, max_length: 80, autocomplete: true },
          { type: 6, name: "client", description: "Optional linked Discord client", required: false },
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
  {
    name: "match-log",
    description: "Log a client's match into Coach HQ",
    type: 1,
    contexts: [0],
    integration_types: [0],
    default_member_permissions: String(MANAGE_GUILD),
    options: [
      { type: 3, name: "map", description: "Overwatch map", required: true, max_length: 80, autocomplete: true },
      {
        type: 3,
        name: "result",
        description: "Match result",
        required: true,
        choices: [
          { name: "Win", value: "Win" },
          { name: "Loss", value: "Loss" },
          { name: "Draw", value: "Draw" },
        ],
      },
      { type: 3, name: "date", description: "Match date in YYYY-MM-DD format (defaults to today)", required: false, min_length: 10, max_length: 10 },
      { type: 3, name: "code", description: "Private client code (use this or a linked Discord client)", required: false, min_length: 4, max_length: 80, autocomplete: true },
      { type: 6, name: "client", description: "Linked Discord client", required: false },
    ],
  },
  {
    name: "reminders",
    description: "Manage per-client meeting reminder settings",
    type: 1,
    contexts: [0],
    integration_types: [0],
    default_member_permissions: String(MANAGE_GUILD),
    options: [
      {
        type: 1,
        name: "set",
        description: "Set this client's reminder offsets",
        options: [
          { type: 3, name: "offsets", description: "Comma-separated times, for example 24h,1h,15m", required: true, min_length: 2, max_length: 120 },
          { type: 3, name: "code", description: "Private client code", required: false, min_length: 4, max_length: 80, autocomplete: true },
          { type: 6, name: "client", description: "Linked Discord client", required: false },
        ],
      },
      {
        type: 1,
        name: "status",
        description: "Show this client's reminder settings",
        options: [
          { type: 3, name: "code", description: "Private client code", required: false, min_length: 4, max_length: 80, autocomplete: true },
          { type: 6, name: "client", description: "Linked Discord client", required: false },
        ],
      },
      {
        type: 1,
        name: "pause",
        description: "Pause all meeting reminders for this client",
        options: [
          { type: 3, name: "code", description: "Private client code", required: false, min_length: 4, max_length: 80, autocomplete: true },
          { type: 6, name: "client", description: "Linked Discord client", required: false },
        ],
      },
      {
        type: 1,
        name: "resume",
        description: "Resume meeting reminders for this client",
        options: [
          { type: 3, name: "code", description: "Private client code", required: false, min_length: 4, max_length: 80, autocomplete: true },
          { type: 6, name: "client", description: "Linked Discord client", required: false },
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

export function focusedCommandOption(options = []) {
  for (const option of options || []) {
    if (option.focused) return option;
    const nested = focusedCommandOption(option.options || []);
    if (nested) return nested;
  }
  return null;
}

export function findClientByCode(workspace, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return (workspace?.clients || []).find(client => normalizeCode(client.clientCode) === normalized) || null;
}

export function findClientByDiscordId(workspace, userId) {
  const normalized = discordId(userId);
  if (!normalized) return null;
  return (workspace?.clients || []).find(client =>
    discordId(client.discordId) === normalized || discordId(client.discord) === normalized
  ) || null;
}

export function autocompleteChoices(workspace, interaction) {
  const focused = focusedCommandOption(interaction?.data?.options || []);
  if (!focused) return [];
  const query = clean(focused.value, 100).toLocaleLowerCase("en-US");

  if (focused.name === "code") {
    const seen = new Set();
    return (workspace?.clients || [])
      .filter(client => normalizeCode(client.clientCode))
      .filter(client => {
        const haystack = [client.name, client.discord, client.rank, client.clientCode].map(value => clean(value, 120).toLocaleLowerCase("en-US")).join(" ");
        return !query || haystack.includes(query);
      })
      .sort((left, right) => clean(left.name, 100).localeCompare(clean(right.name, 100), undefined, { sensitivity: "base" }))
      .filter(client => {
        const value = normalizeCode(client.clientCode);
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      })
      .slice(0, 25)
      .map(client => ({
        name: clean([client.name || "Client", client.rank].filter(Boolean).join(" — "), 100),
        value: normalizeCode(client.clientCode),
      }));
  }

  if (focused.name === "map") {
    const customMaps = (workspace?.matches || []).map(match => clean(match.map, 80)).filter(Boolean);
    const names = [...customMaps, ...OW_MAP_NAMES];
    const unique = [...new Map(names.map(name => [name.toLocaleLowerCase("en-US"), name])).values()];
    const matches = unique.filter(name => {
      const mode = OW_MAP_MODE[name] || "";
      return !query || `${name} ${mode}`.toLocaleLowerCase("en-US").includes(query);
    });
    const choices = matches.slice(0, 25).map(name => ({
      name: clean(OW_MAP_MODE[name] ? `${name} — ${OW_MAP_MODE[name]}` : name, 100),
      value: clean(name, 80),
    }));
    const raw = clean(focused.value, 80);
    if (raw && !unique.some(name => name.toLocaleLowerCase("en-US") === raw.toLocaleLowerCase("en-US")) && choices.length < 25) {
      choices.push({ name: clean(`Use custom map: ${raw}`, 100), value: raw });
    }
    return choices.slice(0, 25);
  }

  return [];
}

export function autocompleteResponse(choices = []) {
  return { type: 8, data: { choices: choices.slice(0, 25) } };
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
  const client = code && typeof code === "object" ? code : findClientByCode(workspace, code);
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

export function validDate(date) {
  return !!dateParts(date);
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

export function parseReminderOffsets(value) {
  const raw = clean(value, 120);
  if (!raw) return { error: "Enter at least one reminder offset, such as 24h,1h." };
  const tokens = raw.split(",").map(token => token.trim()).filter(Boolean);
  if (!tokens.length || tokens.length > 10) return { error: "Enter between 1 and 10 comma-separated reminder offsets." };
  const values = [];
  for (const token of tokens) {
    const match = /^(\d+(?:\.\d+)?)\s*(m|min|mins|h|hr|hrs|d|day|days)?$/i.exec(token);
    if (!match) return { error: `“${token}” is invalid. Use values such as 15m, 1h, or 2d.` };
    const amount = Number(match[1]);
    const unit = (match[2] || "m").toLowerCase();
    const multiplier = unit.startsWith("d") ? 1440 : unit.startsWith("h") ? 60 : 1;
    const minutes = Math.round(amount * multiplier);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 43_200) {
      return { error: "Each reminder must be between 1 minute and 30 days before the meeting." };
    }
    values.push(minutes);
  }
  return { values: [...new Set(values)].sort((left, right) => right - left) };
}

export function formatReminderOffsets(offsets = []) {
  return offsets.map(minutes => {
    if (minutes % 1440 === 0) return `${minutes / 1440}d`;
    if (minutes % 60 === 0) return `${minutes / 60}h`;
    return `${minutes}m`;
  }).join(", ");
}

export function effectiveReminderSettings(client, defaults = [1440, 60]) {
  const saved = client?.discordReminderSettings || {};
  const custom = Array.isArray(saved.offsetsMinutes)
    ? [...new Set(saved.offsetsMinutes.map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= 43_200))].sort((a, b) => b - a)
    : [];
  return {
    paused: saved.paused === true,
    offsets: custom.length ? custom : defaults,
    customized: custom.length > 0,
  };
}

function canonicalize(value, choices) {
  const input = clean(value, 120);
  return choices.find(choice => choice.toLocaleLowerCase("en-US") === input.toLocaleLowerCase("en-US")) || input;
}

export function matchLogModal({ customId, clientName, map, result }) {
  return {
    type: 9,
    data: {
      custom_id: clean(customId, 100),
      title: clean(`Log match — ${clientName || "Client"}`, 45),
      components: [
        {
          type: 18,
          label: "Match type",
          description: clean(`${map} • ${result}`, 100),
          component: {
            type: 3,
            custom_id: "match_type",
            options: MATCH_TYPES.map((value, index) => ({ label: value, value, ...(index === 0 ? { default: true } : {}) })),
            required: true,
          },
        },
        {
          type: 18,
          label: "Role",
          component: {
            type: 3,
            custom_id: "role",
            placeholder: "Optional",
            options: OW_ROLES.map(value => ({ label: value, value })),
            min_values: 0,
            max_values: 1,
            required: false,
          },
        },
        {
          type: 18,
          label: "Heroes played",
          description: "Separate multiple heroes with commas",
          component: { type: 4, custom_id: "heroes", style: 1, required: false, max_length: 400, placeholder: "Tracer, Genji" },
        },
        {
          type: 18,
          label: "Replay code",
          component: { type: 4, custom_id: "replay_code", style: 1, required: false, max_length: 40, placeholder: "ABC123" },
        },
        {
          type: 18,
          label: "Notes",
          component: { type: 4, custom_id: "notes", style: 2, required: false, max_length: 1500, placeholder: "Key moments, matchup notes, or coaching context" },
        },
      ],
    },
  };
}

export function modalValues(components = []) {
  const values = {};
  for (const wrapper of components || []) {
    const children = wrapper?.component ? [wrapper.component] : wrapper?.components || [];
    for (const component of children) {
      if (!component?.custom_id) continue;
      values[component.custom_id] = Array.isArray(component.values) ? component.values[0] || "" : component.value || "";
    }
  }
  return values;
}

export function buildDiscordMatch({ id, clientId, date, map, result, type, role, heroes, replayCode, notes, createdBy }) {
  const canonicalMap = canonicalize(map, OW_MAP_NAMES);
  const canonicalRole = canonicalize(role, OW_ROLES);
  const matchType = canonicalize(type, MATCH_TYPES);
  const canonicalResult = canonicalize(result, ["Win", "Loss", "Draw"]);
  if (!id || !clientId || !validDate(date) || !canonicalMap || !["Win", "Loss", "Draw"].includes(canonicalResult)) return null;
  const createdAt = new Date().toISOString();
  return {
    id: clean(id, 100),
    clientId: clean(clientId, 100),
    date: clean(date, 10),
    type: MATCH_TYPES.includes(matchType) ? matchType : "Competitive",
    result: canonicalResult,
    role: OW_ROLES.includes(canonicalRole) ? canonicalRole : "",
    map: canonicalMap,
    mode: OW_MAP_MODE[canonicalMap] || "",
    heroes: clean(heroes, 400).split(/[,;\n]/).map(hero => canonicalize(hero, OW_HERO_NAMES)).filter(Boolean).slice(0, 8),
    rankBefore: "",
    rankAfter: "",
    replayCode: clean(replayCode, 40),
    notes: clean(notes, 1500),
    source: "discord",
    createdByDiscordId: discordId(createdBy),
    createdAt,
    updatedAt: createdAt,
  };
}

function escapeDiscordMarkdown(value) {
  return clean(value, 1000).replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, "\\$1");
}

export function auditMessage({ action, actorId, clientName, details = [], at = new Date() }) {
  const coachId = discordId(actorId);
  const rows = [
    `📋 **${escapeDiscordMarkdown(action || "Bot change")}**`,
    coachId ? `Coach: <@${coachId}>` : "Coach: Unknown",
    clientName ? `Client: **${escapeDiscordMarkdown(clientName)}**` : "",
    ...details.map(detail => escapeDiscordMarkdown(detail)).filter(Boolean),
    `When: ${discordTimestamp(at)}`,
  ].filter(Boolean);
  return clean(rows.join("\n"), 1900);
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
  const client = code && typeof code === "object" ? code : code ? findClientByCode(workspace, code) : null;
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

export function messageResponse({ content = "", embeds, ephemeral = false }) {
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
