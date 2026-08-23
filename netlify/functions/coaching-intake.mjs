const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const clean = (value, max) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .trim()
  .slice(0, max);

const oneLine = (value, max) => clean(value, max).replace(/\s+/g, " ");

function validWebhook(url) {
  return /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/i.test(oneLine(url, 500));
}

function optionalHttpUrl(value) {
  const candidate = oneLine(value, 500);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "Send the application as JSON." }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 15_000) {
    return json({ error: "Application is too large." }, 413);
  }

  const input = await request.json().catch(() => ({}));
  if (oneLine(input.website, 200)) return json({ ok: true });

  const application = {
    name: oneLine(input.name, 80),
    discord: oneLine(input.discord, 80),
    game: oneLine(input.game, 80),
    rank: oneLine(input.rank, 80),
    role: oneLine(input.role, 120),
    service: oneLine(input.service, 80),
    availability: oneLine(input.availability, 200),
    vodUrl: optionalHttpUrl(input.vodUrl),
    goals: clean(input.goals, 1800),
  };

  const required = ["name", "discord", "game", "rank", "role", "service", "availability", "goals"];
  if (required.some(field => !application[field])) {
    return json({ error: "Complete every required field before sending." }, 400);
  }
  if (input.vodUrl && !application.vodUrl) {
    return json({ error: "The VOD link must be a valid http or https URL." }, 400);
  }

  const webhook = process.env.DISCORD_INTAKE_WEBHOOK_URL || "";
  const botToken = oneLine(process.env.DISCORD_BOT_TOKEN, 200);
  const channelId = oneLine(process.env.DISCORD_INTAKE_CHANNEL_ID, 30);
  const useWebhook = validWebhook(webhook);
  const useBot = !!botToken && /^\d{17,20}$/.test(channelId);
  if (!useWebhook && !useBot) {
    console.error("Configure DISCORD_INTAKE_WEBHOOK_URL or DISCORD_BOT_TOKEN with DISCORD_INTAKE_CHANNEL_ID.");
    return json({ error: "The coaching application inbox is not configured yet." }, 503);
  }

  const fields = [
    { name: "Discord", value: application.discord, inline: true },
    { name: "Game", value: application.game, inline: true },
    { name: "Rank", value: application.rank, inline: true },
    { name: "Role / heroes", value: application.role, inline: true },
    { name: "Preferred coaching", value: application.service, inline: true },
    { name: "Availability", value: application.availability, inline: false },
  ];
  if (application.vodUrl) fields.push({ name: "VOD / replay", value: application.vodUrl, inline: false });

  try {
    const discordPayload = {
      username: "HONE Coaching Intake",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: `New coaching application — ${application.name}`,
        description: `**What they want to improve**\n${application.goals}`,
        color: 0x8f00ff,
        fields,
        footer: { text: "sufferingbuildscharacter.com coaching match form" },
        timestamp: new Date().toISOString(),
      }],
    };
    const destination = useWebhook
      ? webhook
      : `https://discord.com/api/v10/channels/${channelId}/messages`;
    const response = await fetch(destination, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(useWebhook ? {} : { "Authorization": `Bot ${botToken}` }),
      },
      body: JSON.stringify(useWebhook
        ? discordPayload
        : { allowed_mentions: discordPayload.allowed_mentions, embeds: discordPayload.embeds }),
    });
    if (!response.ok) throw new Error(`Discord webhook returned ${response.status}.`);
    return json({ ok: true });
  } catch (error) {
    console.error("Could not deliver coaching application:", error);
    return json({ error: "Discord could not receive the application right now. Please try again shortly." }, 502);
  }
};

export const config = {
  path: "/api/coaching-intake",
  rateLimit: {
    windowLimit: 5,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
