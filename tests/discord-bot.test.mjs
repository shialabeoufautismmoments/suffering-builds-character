import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  DISCORD_COMMANDS,
  auditMessage,
  autocompleteChoices,
  buildDiscordMatch,
  clientMapStats,
  createMeetings,
  effectiveReminderSettings,
  findClientByDiscordId,
  formatReminderOffsets,
  isAuthorizedStaff,
  matchLogModal,
  messageResponse,
  modalValues,
  parseReminderOffsets,
  statsEmbed,
  verifyDiscordRequest,
  zonedTimeToUtc,
} from "../netlify/lib/discord-bot.mjs";
import discordInteractions, { resolveMatchClient } from "../netlify/functions/discord-interactions.mjs";
import { dueReminders, reminderContent } from "../netlify/functions/discord-session-reminders.mjs";

const CLIENT_CODE = "SBC-TEST-01";
const CLIENT_ID = "client-1";
const USER_ID = "154409348698106278";
const CHANNEL_ID = "154409348698106279";

function workspace() {
  return {
    clients: [{ id: CLIENT_ID, name: "Player One", clientCode: CLIENT_CODE, discordId: USER_ID, game: "Overwatch 2", rank: "Masters" }],
    matches: [
      { id: "1", clientId: CLIENT_ID, result: "Win", map: "King's Row", mode: "Hybrid" },
      { id: "2", clientId: CLIENT_ID, result: "Loss", map: "king's row", mode: "Hybrid" },
      { id: "3", clientId: CLIENT_ID, result: "Draw", map: "King's Row", mode: "Hybrid" },
      { id: "4", clientId: CLIENT_ID, result: "Win", map: "Lijiang Tower", mode: "Control" },
      { id: "5", clientId: "someone-else", result: "Win", map: "Dorado", mode: "Escort" },
    ],
    scheduled: [],
    settings: { timeZone: "America/Winnipeg" },
  };
}

test("Discord command definitions expose the requested workflows", () => {
  assert.deepEqual(DISCORD_COMMANDS.map(command => command.name), ["client-stats", "meeting", "match-log", "reminders"]);
  assert.ok(DISCORD_COMMANDS.filter(command => command.name !== "match-log").every(command => command.default_member_permissions === "32"));
  assert.equal(DISCORD_COMMANDS.find(command => command.name === "match-log").default_member_permissions, undefined);
  assert.ok(DISCORD_COMMANDS.every(command => command.contexts.length === 1 && command.contexts[0] === 0));
  const statsOptions = DISCORD_COMMANDS.find(command => command.name === "client-stats").options;
  assert.equal(statsOptions.find(option => option.name === "code").required, false);
  assert.equal(statsOptions.find(option => option.name === "code").autocomplete, true);
  assert.equal(statsOptions.find(option => option.name === "map").autocomplete, true);
  assert.equal(statsOptions.find(option => option.name === "client").type, 6);
  assert.equal(DISCORD_COMMANDS.find(command => command.name === "match-log").options.find(option => option.name === "map").autocomplete, true);
});

test("clients can log only to their own Discord-linked profile while staff can select any client", () => {
  const data = workspace();
  data.clients.push({
    id: "client-2",
    name: "Player Two",
    clientCode: "SBC-TEST-02",
    discordId: "254409348698106278",
  });
  assert.equal(resolveMatchClient(data, { actorId: USER_ID }).client.id, CLIENT_ID);
  assert.equal(resolveMatchClient(data, { actorId: USER_ID, code: CLIENT_CODE }).client.id, CLIENT_ID);
  assert.match(resolveMatchClient(data, { actorId: USER_ID, code: "SBC-TEST-02" }).error, /only log matches/);
  assert.match(resolveMatchClient(data, { actorId: USER_ID, userId: "254409348698106278" }).error, /only log matches/);
  assert.equal(resolveMatchClient(data, { actorId: USER_ID, code: "SBC-TEST-02", staff: true }).client.id, "client-2");
  assert.match(resolveMatchClient(data, { actorId: "354409348698106278" }).error, /not linked/);
});

test("client and map autocomplete return Discord-compatible choices", () => {
  const data = workspace();
  const clients = autocompleteChoices(data, {
    data: { options: [{ name: "code", type: 3, value: "player", focused: true }] },
  });
  assert.deepEqual(clients, [{ name: "Player One — Masters", value: CLIENT_CODE }]);

  data.matches.push({ id: "6", clientId: CLIENT_ID, result: "Win", map: "king's row" });
  const maps = autocompleteChoices(data, {
    data: { options: [{ name: "map", type: 3, value: "king", focused: true }] },
  });
  assert.equal(maps[0].value, "King's Row");
  assert.match(maps[0].name, /Hybrid/);
  assert.ok(maps.length <= 25);
});

test("bot command replies are public by default", () => {
  assert.equal(messageResponse({ content: "Visible" }).data.flags, undefined);
  assert.equal(messageResponse({ content: "Private", ephemeral: true }).data.flags, 64);
});

test("Discord signatures are verified and stale requests are rejected", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const publicHex = publicDer.subarray(-32).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");

  assert.equal(verifyDiscordRequest({ publicKey: publicHex, signature, timestamp, body }), true);
  assert.equal(verifyDiscordRequest({ publicKey: publicHex, signature, timestamp, body: `${body}x` }), false);
  assert.equal(verifyDiscordRequest({ publicKey: publicHex, signature, timestamp, body, now: Date.now() + 6 * 60_000 }), false);
});

test("the deployed interaction handler completes Discord's signed PING handshake", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const publicHex = publicDer.subarray(-32).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex");
  const previous = process.env.DISCORD_PUBLIC_KEY;
  process.env.DISCORD_PUBLIC_KEY = publicHex;
  try {
    const response = await discordInteractions(new Request("https://example.test/api/discord", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      body,
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { type: 1 });
  } finally {
    if (previous === undefined) delete process.env.DISCORD_PUBLIC_KEY;
    else process.env.DISCORD_PUBLIC_KEY = previous;
  }
});

test("staff authorization accepts managers and configured roles only in the configured guild", () => {
  const base = { guild_id: "111111111111111111", member: { user: { id: USER_ID }, roles: [], permissions: "32" } };
  assert.equal(isAuthorizedStaff(base, { guildId: base.guild_id }), true);
  assert.equal(isAuthorizedStaff({ ...base, guild_id: "222222222222222222" }, { guildId: base.guild_id }), false);
  assert.equal(isAuthorizedStaff({ ...base, member: { ...base.member, permissions: "0", roles: ["333333333333333333"] } }, {
    guildId: base.guild_id,
    roleIds: new Set(["333333333333333333"]),
  }), true);
});

test("client stats group map names case-insensitively and exclude draws from win rate", () => {
  const data = workspace();
  const linked = findClientByDiscordId(data, USER_ID);
  assert.equal(linked.id, CLIENT_ID);
  const stats = clientMapStats(data, linked);
  assert.equal(stats.client.name, "Player One");
  assert.deepEqual(stats.overall, { wins: 2, losses: 1, draws: 1, total: 4, decisive: 3, winRate: 67 });
  const kingsRow = stats.maps.find(map => map.name === "King's Row");
  assert.deepEqual(
    { wins: kingsRow.wins, losses: kingsRow.losses, draws: kingsRow.draws, total: kingsRow.total, winRate: kingsRow.winRate },
    { wins: 1, losses: 1, draws: 1, total: 3, winRate: 50 },
  );
  assert.equal(clientMapStats(workspace(), CLIENT_CODE, "lijiang").maps[0].name, "Lijiang Tower");
  assert.equal(JSON.stringify(statsEmbed(stats)).includes(CLIENT_CODE), false);
});

test("meeting dates are converted from the coaching timezone and repeat weekly", () => {
  const instant = zonedTimeToUtc("2026-09-14", "18:30", "America/Winnipeg");
  assert.equal(instant.toISOString(), "2026-09-14T23:30:00.000Z");
  const meetings = createMeetings({
    clientId: CLIENT_ID,
    date: "2026-09-14",
    time: "18:30",
    timeZone: "America/Winnipeg",
    repeatWeeks: 3,
    channelId: CHANNEL_ID,
    userId: USER_ID,
    createdBy: USER_ID,
  });
  assert.deepEqual(meetings.map(meeting => meeting.date), ["2026-09-14", "2026-09-21", "2026-09-28"]);
  assert.ok(meetings.every(meeting => meeting.recurId === meetings[0].recurId));
  assert.ok(meetings.every(meeting => meeting.discordChannelId === CHANNEL_ID && meeting.discordUserId === USER_ID));
});

test("match logging modal data becomes a normalized Coach HQ match", () => {
  const modal = matchLogModal({ customId: "match-log:123", clientName: "Player One", map: "king's row", result: "Win" });
  assert.equal(modal.type, 9);
  assert.equal(modal.data.components.length, 5);
  assert.ok(modal.data.components.every(component => component.type === 18));

  const values = modalValues([
    { type: 18, component: { custom_id: "match_type", values: ["Scrim"] } },
    { type: 18, component: { custom_id: "role", values: ["Damage"] } },
    { type: 18, component: { custom_id: "heroes", value: "tracer, GENJI" } },
    { type: 18, component: { custom_id: "replay_code", value: "ABC123" } },
    { type: 18, component: { custom_id: "notes", value: "Reviewed first fight" } },
  ]);
  const match = buildDiscordMatch({
    id: "discord-match-123",
    clientId: CLIENT_ID,
    date: "2026-09-01",
    map: "king's row",
    result: "win",
    type: values.match_type,
    role: values.role,
    heroes: values.heroes,
    replayCode: values.replay_code,
    notes: values.notes,
    createdBy: USER_ID,
  });
  assert.equal(match.map, "King's Row");
  assert.equal(match.mode, "Hybrid");
  assert.equal(match.result, "Win");
  assert.deepEqual(match.heroes, ["Tracer", "Genji"]);
  assert.equal(match.source, "discord");
});

test("per-client reminder settings parse, format, and override server defaults", () => {
  assert.deepEqual(parseReminderOffsets("2d, 6h, 15m, 15m").values, [2880, 360, 15]);
  assert.equal(formatReminderOffsets([2880, 360, 15]), "2d, 6h, 15m");
  assert.match(parseReminderOffsets("tomorrow").error, /invalid/);
  assert.deepEqual(effectiveReminderSettings({}, [1440, 60]), {
    paused: false,
    offsets: [1440, 60],
    customized: false,
  });
  assert.deepEqual(effectiveReminderSettings({ discordReminderSettings: { paused: true, offsetsMinutes: [30, 120] } }, [1440, 60]), {
    paused: true,
    offsets: [120, 30],
    customized: true,
  });
});

test("audit messages identify the submitter without exposing client codes", () => {
  const content = auditMessage({
    action: "Match logged",
    actorId: USER_ID,
    clientName: "Player One",
    details: ["King's Row • Win"],
    at: new Date("2026-09-01T12:00:00.000Z"),
  });
  assert.match(content, new RegExp(`<@${USER_ID}>`));
  assert.match(content, /Player One/);
  assert.equal(content.includes(CLIENT_CODE), false);
});

test("reminders become due once per configured offset and use the session channel user", () => {
  const data = workspace();
  data.scheduled.push({
    id: "meeting-1",
    clientId: CLIENT_ID,
    date: "2026-09-14",
    time: "18:30",
    timeZone: "America/Winnipeg",
    discordChannelId: CHANNEL_ID,
    discordUserId: USER_ID,
    notes: "Map review",
    done: false,
  });
  const now = new Date("2026-09-14T22:30:00.000Z");
  const due = dueReminders(data, {}, now, { offsets: [60], graceMinutes: 10 });
  assert.equal(due.length, 1);
  assert.equal(due[0].key, "meeting-1:2026-09-14T18:30:60");
  assert.match(reminderContent(due[0]), new RegExp(`<@${USER_ID}>`));
  assert.equal(dueReminders(data, { "meeting-1:60": now.toISOString() }, now, { offsets: [60], graceMinutes: 10 }).length, 0);
  data.scheduled[0].updatedAt = now.toISOString();
  assert.equal(dueReminders(data, { "meeting-1:60": now.toISOString() }, now, { offsets: [60], graceMinutes: 10 }).length, 1);
  assert.equal(dueReminders(data, { [due[0].key]: now.toISOString() }, now, { offsets: [60], graceMinutes: 10 }).length, 0);

  data.clients[0].discordReminderSettings = { offsetsMinutes: [30] };
  assert.equal(dueReminders(data, {}, now, { offsets: [60], graceMinutes: 10 }).length, 0);
  assert.equal(dueReminders(data, {}, new Date("2026-09-14T23:00:00.000Z"), { offsets: [60], graceMinutes: 10 }).length, 1);
  data.clients[0].discordReminderSettings.paused = true;
  assert.equal(dueReminders(data, {}, new Date("2026-09-14T23:00:00.000Z"), { offsets: [60], graceMinutes: 10 }).length, 0);
});
