import { DISCORD_COMMANDS } from "../netlify/lib/discord-bot.mjs";

const applicationId = String(process.env.DISCORD_APPLICATION_ID || "").trim();
const guildId = String(process.env.DISCORD_GUILD_ID || "").trim();
const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();

const missing = [
  ["DISCORD_APPLICATION_ID", applicationId],
  ["DISCORD_GUILD_ID", guildId],
  ["DISCORD_BOT_TOKEN", token],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
  console.error(`Missing environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  console.error("Set them locally, then run npm run discord:register again.");
  process.exit(1);
}

if (!/^\d{17,20}$/.test(applicationId) || !/^\d{17,20}$/.test(guildId)) {
  console.error("DISCORD_APPLICATION_ID and DISCORD_GUILD_ID must be numeric Discord IDs.");
  process.exit(1);
}

const endpoint = `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`;
const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(DISCORD_COMMANDS),
});
const body = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(`Discord command registration failed (${response.status}).`);
  console.error(body?.message || JSON.stringify(body));
  process.exit(1);
}

console.log(`Registered ${body.length} guild command${body.length === 1 ? "" : "s"}: ${body.map(command => `/${command.name}`).join(", ")}`);
