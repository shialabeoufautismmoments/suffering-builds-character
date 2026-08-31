import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  DISCORD_COMMANDS,
  clientMapStats,
  createMeetings,
  isAuthorizedStaff,
  statsEmbed,
  verifyDiscordRequest,
  zonedTimeToUtc,
} from "../netlify/lib/discord-bot.mjs";
import discordInteractions from "../netlify/functions/discord-interactions.mjs";
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

test("Discord command definitions expose the requested private workflows", () => {
  assert.deepEqual(DISCORD_COMMANDS.map(command => command.name), ["client-stats", "meeting"]);
  assert.ok(DISCORD_COMMANDS.every(command => command.default_member_permissions === "32"));
  assert.ok(DISCORD_COMMANDS.every(command => command.contexts.length === 1 && command.contexts[0] === 0));
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
  const stats = clientMapStats(workspace(), CLIENT_CODE.toLowerCase());
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
});
