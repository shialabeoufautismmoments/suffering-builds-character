import { createSession, verifyPassword } from "../lib/coach-auth.mjs";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const body = await request.json().catch(() => ({}));

  try {
    if (!verifyPassword(body.password || "")) {
      return json({ error: "Incorrect password." }, 401);
    }
    return json({ token: createSession(), expiresIn: 43_200 });
  } catch (error) {
    console.error(error);
    return json({ error: "Coach authentication is not configured." }, 503);
  }
};

export const config = { path: "/api/coach-session" };
