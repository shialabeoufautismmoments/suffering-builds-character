import { createCoachingLead } from "../lib/coaching-leads.mjs";
import { recordSiteEvent } from "../lib/site-analytics.mjs";

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
    referralCode: oneLine(input.referralCode, 32).toUpperCase().replace(/[^A-Z0-9-]/g, ""),
    landingPath: oneLine(input.landingPath, 180).split(/[?#]/)[0],
    referrerHost: oneLine(input.referrerHost, 120).toLowerCase().replace(/[^a-z0-9.:-]/g, ""),
    utmSource: oneLine(input.utmSource, 100),
    utmMedium: oneLine(input.utmMedium, 100),
    utmCampaign: oneLine(input.utmCampaign, 120),
    utmContent: oneLine(input.utmContent, 120),
    utmTerm: oneLine(input.utmTerm, 120),
  };
  if (!application.landingPath.startsWith("/")) application.landingPath = "/";

  const required = ["name", "discord", "game", "rank", "role", "service", "availability", "goals"];
  if (required.some(field => !application[field])) {
    return json({ error: "Complete every required field before sending." }, 400);
  }
  if (input.vodUrl && !application.vodUrl) {
    return json({ error: "The VOD link must be a valid http or https URL." }, 400);
  }
  if (input.consent !== true) {
    return json({ error: "Agree to the privacy, terms, and cancellation policies before sending." }, 400);
  }

  let lead;
  try {
    lead = await createCoachingLead({
      ...application,
      source: "website",
      acceptedPolicies: {
        privacy: "2026-08-25",
        terms: "2026-08-25",
        cancellation: "2026-08-24",
        acceptedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Could not save coaching application:", error);
    return json({ error: "We could not safely save the application. Please try again shortly." }, 503);
  }

  const attributionSource = application.referralCode
    ? "Referral"
    : application.utmSource || application.referrerHost || "Direct";
  try {
    await recordSiteEvent({
      event: "application", page: application.landingPath, source: attributionSource,
      campaign: application.utmCampaign, label: application.service,
    });
  } catch (error) {
    console.error("Could not update anonymous application analytics:", error);
  }

  const webhook = process.env.DISCORD_INTAKE_WEBHOOK_URL || "";
  const botToken = oneLine(process.env.DISCORD_BOT_TOKEN, 200);
  const channelId = oneLine(process.env.DISCORD_INTAKE_CHANNEL_ID, 30);
  const useWebhook = validWebhook(webhook);
  const useBot = !!botToken && /^\d{17,20}$/.test(channelId);
  if (!useWebhook && !useBot) {
    console.error("Configure DISCORD_INTAKE_WEBHOOK_URL or DISCORD_BOT_TOKEN with DISCORD_INTAKE_CHANNEL_ID.");
    return json({ ok: true, delivered: false, leadId: lead.id });
  }

  const siteUrl = String(process.env.URL || "https://sufferingbuildscharacter.com").replace(/\/$/, "");
  const hqUrl = `${siteUrl}/apps/hq/?view=waitlist&lead=${encodeURIComponent(lead.id)}`;

  const fields = [
    { name: "Discord", value: application.discord, inline: true },
    { name: "Game", value: application.game, inline: true },
    { name: "Rank", value: application.rank, inline: true },
    { name: "Role / heroes", value: application.role, inline: true },
    { name: "Preferred coaching", value: application.service, inline: true },
    { name: "Availability", value: application.availability, inline: false },
  ];
  if (application.vodUrl) fields.push({ name: "VOD / replay", value: application.vodUrl, inline: false });
  if (application.referralCode) fields.push({ name: "Referral", value: application.referralCode, inline: true });
  if (application.utmCampaign) fields.push({ name: "Campaign", value: application.utmCampaign, inline: true });

  try {
    const discordPayload = {
      username: "HONE Coaching Intake",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: `New coaching application — ${application.name}`,
        description: `**What they want to improve**\n${application.goals}`,
        url: hqUrl,
        color: 0x8f00ff,
        fields: [...fields, { name: "Pipeline", value: `[Open saved lead in Coach HQ](${hqUrl})`, inline: false }],
        footer: { text: `Saved lead ${lead.id} • sufferingbuildscharacter.com` },
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
    return json({ ok: true, delivered: true, leadId: lead.id });
  } catch (error) {
    console.error("Could not deliver coaching application:", error);
    return json({ ok: true, delivered: false, leadId: lead.id });
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
