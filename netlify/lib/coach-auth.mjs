import { createHmac, timingSafeEqual } from "node:crypto";

const encode = (value) => Buffer.from(value).toString("base64url");
const sign = (payload, secret) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPassword(candidate) {
  const expected = process.env.COACH_APP_PASSWORD;
  if (!expected) throw new Error("COACH_APP_PASSWORD is not configured.");
  return safeEqual(candidate, expected);
}

export function createSession() {
  const secret = process.env.COACH_SESSION_SECRET;
  if (!secret) throw new Error("COACH_SESSION_SECRET is not configured.");
  const payload = encode(JSON.stringify({
    scope: "coach-workspace",
    exp: Date.now() + 12 * 60 * 60 * 1000
  }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(request) {
  const secret = process.env.COACH_SESSION_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.scope === "coach-workspace" && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}
