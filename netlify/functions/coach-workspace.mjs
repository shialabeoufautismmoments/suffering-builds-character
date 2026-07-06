import { getStore } from "@netlify/blobs";
import { verifySession } from "../lib/coach-auth.mjs";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (request) => {
  if (!verifySession(request)) return json({ error: "Unlock the coaching app again." }, 401);

  const store = getStore({ name: "coachsbc-workspace", consistency: "strong" });
  const key = "shared/team-workspace-v2";

  if (request.method === "GET") {
    return json({ data: await store.get(key, { type: "json" }) || null });
  }

  if (request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    if (!body?.data || typeof body.data !== "object") {
      return json({ error: "Invalid workspace data." }, 400);
    }

    const serialized = JSON.stringify(body.data);
    if (serialized.length > 4_500_000) {
      return json({ error: "Workspace is too large to sync." }, 413);
    }

    const current = await store.get(key, { type: "json" });
    const currentRevision = Number(current?.cloud?.revision || 0);
    const baseRevision = Number(body.baseRevision || 0);
    if (current && baseRevision !== currentRevision) {
      return json({ error: "Workspace changed on another device.", data: current }, 409);
    }

    const saved = {
      ...body.data,
      cloud: {
        ...(body.data.cloud || {}),
        revision: currentRevision + 1,
        updatedAt: new Date().toISOString()
      }
    };
    await store.setJSON(key, saved);
    return json({ data: saved });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/coach-workspace" };
