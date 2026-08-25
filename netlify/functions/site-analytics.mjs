import { verifySession } from "../lib/coach-auth.mjs";
import { recordSiteEvent, siteAnalyticsSummary } from "../lib/site-analytics.mjs";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (request) => {
  try {
    if (request.method === "GET") {
      if (!verifySession(request)) return json({ error: "Unlock the coaching app again." }, 401);
      const days = new URL(request.url).searchParams.get("days");
      return json({ analytics: await siteAnalyticsSummary(days) });
    }
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ error: "Send analytics as JSON." }, 415);
      if (Number(request.headers.get("content-length") || 0) > 4_000) return json({ error: "Analytics event is too large." }, 413);
      const input = await request.json().catch(() => ({}));
      if (!['page_view', 'cta_click'].includes(input.event)) return json({ error: "Unsupported analytics event." }, 400);
      await recordSiteEvent(input);
      return json({ ok: true }, 202);
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("Site analytics request failed:", error);
    return json({ error: request.method === "GET" ? "Could not load conversion analytics." : "Analytics event was not recorded." }, 500);
  }
};

export const config = {
  path: "/api/site-analytics",
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
