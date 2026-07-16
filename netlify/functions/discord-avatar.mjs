import { getStore } from "@netlify/blobs";
import { verifySession } from "../lib/coach-auth.mjs";

// Looks up a Discord user's avatar server-side (needs a bot token, so this
// can't run in the browser) and returns it as a data URL, the same shape
// HQ's desktop-only window.api.discordAvatarLookup() already produces - this
// is the web-compatible equivalent, usable both from the client app (which
// has no desktop build) and from HQ's own web deploy (web-api.js previously
// hard-disabled this: "only available in the desktop app").
const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const store = () => getStore({ name: "coachsbc-workspace", consistency: "strong" });
const key = "shared/team-workspace-v2";

const env = k => String((globalThis.Netlify?.env?.get?.(k)) || process.env[k] || "").trim();
const normalizeCode = value => String(value || "").trim().toUpperCase();
const discordId = value => /^(?:<@!?)?(\d{17,20})>?$/.exec(String(value || "").trim())?.[1] || "";

function findClient(workspace, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return (workspace.clients || []).find(client => normalizeCode(client.clientCode) === normalized) || null;
}

const MAX_AVATAR_BYTES = 400_000; // keep the synced workspace payload small

export default async (request) => {
  const url = new URL(request.url);
  const id = discordId(url.searchParams.get("id"));
  if (!id) return json({ error: "Pass a numeric Discord User ID (?id=...)." }, 400);

  // Accept either an unlocked coach session (HQ) or a valid client code
  // (client app) - either way, only someone already inside the tool can
  // burn through the shared bot token's rate limit. Discord avatars are
  // public info, so this is about abuse prevention, not privacy.
  const code = request.headers.get("x-client-code") || url.searchParams.get("code");
  const workspace = await store().get(key, { type: "json" }).catch(() => null);
  const authorized = verifySession(request) || (workspace && !!findClient(workspace, code));
  if (!authorized) return json({ error: "Not authorized." }, 401);

  const token = env("DISCORD_BOT_TOKEN");
  if (!token) return json({ success: false, msg: "Discord avatar lookup isn't configured (missing DISCORD_BOT_TOKEN)." }, 200);

  try {
    const userRes = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (userRes.status === 404) return json({ success: false, msg: "No Discord account found with that ID." });
    if (!userRes.ok) throw new Error(`Discord API returned ${userRes.status}`);
    const user = await userRes.json();
    if (!user.avatar) return json({ success: false, msg: "That Discord account has no custom avatar set." });

    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    const avatarUrl = `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.${ext}?size=256`;
    const imgRes = await fetch(avatarUrl);
    if (!imgRes.ok) throw new Error(`Could not fetch avatar image (${imgRes.status}).`);
    const buf = await imgRes.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) return json({ success: false, msg: "That avatar image is too large." });

    const mime = ext === "gif" ? "image/gif" : "image/png";
    const base64 = Buffer.from(buf).toString("base64");
    return json({
      success: true,
      avatarDataUrl: `data:${mime};base64,${base64}`,
      userId: id,
      username: user.username || "",
    });
  } catch (error) {
    return json({ success: false, msg: error.message || "Discord avatar lookup failed." });
  }
};

export const config = { path: "/api/discord-avatar" };
