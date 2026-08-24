import { verifySession } from "../lib/coach-auth.mjs";
import { createCoachingLead, listCoachingLeads, updateCoachingLead } from "../lib/coaching-leads.mjs";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (request) => {
  if (!verifySession(request)) return json({ error: "Unlock the coaching app again." }, 401);

  try {
    if (request.method === "GET") {
      return json({ leads: await listCoachingLeads() });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!String(body.name || "").trim() && !String(body.discord || "").trim()) {
        return json({ error: "Add a player name or Discord username." }, 400);
      }
      return json({ lead: await createCoachingLead({ ...body, source: "manual" }) }, 201);
    }

    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      const lead = await updateCoachingLead(body.id, body);
      return lead ? json({ lead }) : json({ error: "Lead not found." }, 404);
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("Coach leads request failed:", error);
    return json({ error: error.message || "Could not update coaching leads." }, 500);
  }
};

export const config = { path: "/api/coach-leads" };
