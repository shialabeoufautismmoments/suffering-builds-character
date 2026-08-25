import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Booked", "Closed", "Archived"];

const leadStore = () => getStore({ name: "coachsbc-coaching-leads", consistency: "strong" });
const leadKey = id => `lead/${id}`;
const clean = (value, max = 5000) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
  .trim()
  .slice(0, max);
const oneLine = (value, max = 500) => clean(value, max).replace(/\s+/g, " ");
const safeId = value => /^[a-zA-Z0-9-]{8,80}$/.test(String(value || "")) ? String(value) : "";
const referralCode = value => oneLine(value, 32).toUpperCase().replace(/[^A-Z0-9-]/g, "");
const pagePath = value => {
  const path = oneLine(value, 180).split(/[?#]/)[0];
  return path.startsWith("/") ? path : "";
};

function leadFields(input = {}) {
  return {
    name: oneLine(input.name, 80),
    discord: oneLine(input.discord, 80),
    game: oneLine(input.game, 80),
    rank: oneLine(input.rank, 80),
    role: oneLine(input.role, 120),
    service: oneLine(input.service, 80),
    availability: oneLine(input.availability, 200),
    vodUrl: oneLine(input.vodUrl, 500),
    goals: clean(input.goals, 1800),
    assignedCoachId: oneLine(input.assignedCoachId, 80),
    internalNotes: clean(input.internalNotes ?? input.notes, 3000),
    contactDate: oneLine(input.contactDate, 20),
    referralCode: referralCode(input.referralCode),
    landingPath: pagePath(input.landingPath),
    referrerHost: oneLine(input.referrerHost, 120).toLowerCase().replace(/[^a-z0-9.:-]/g, ""),
    utmSource: oneLine(input.utmSource, 100),
    utmMedium: oneLine(input.utmMedium, 100),
    utmCampaign: oneLine(input.utmCampaign, 120),
    utmContent: oneLine(input.utmContent, 120),
    utmTerm: oneLine(input.utmTerm, 120),
    convertedClientId: oneLine(input.convertedClientId, 80),
  };
}

export async function createCoachingLead(input = {}) {
  const now = new Date().toISOString();
  const id = randomUUID();
  const requestedStatus = oneLine(input.status, 30);
  const record = {
    id,
    ...leadFields(input),
    status: LEAD_STATUSES.includes(requestedStatus) ? requestedStatus : "New",
    source: oneLine(input.source, 30) || "website",
    acceptedPolicies: input.acceptedPolicies && typeof input.acceptedPolicies === "object"
      ? input.acceptedPolicies
      : null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await leadStore().setJSON(leadKey(id), record, { onlyIfNew: true });
  if (result?.modified === false) throw new Error("Could not allocate a unique coaching lead ID.");
  return record;
}

export async function listCoachingLeads() {
  const store = leadStore();
  const result = await store.list({ prefix: "lead/" });
  const leads = (await Promise.all((result.blobs || []).map(blob =>
    store.get(blob.key, { type: "json" })
  ))).filter(Boolean);
  return leads.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function updateCoachingLead(id, patch = {}) {
  const normalizedId = safeId(id);
  if (!normalizedId) return null;
  const store = leadStore();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.getWithMetadata(leadKey(normalizedId), { type: "json" });
    if (!current?.data) return null;
    const requestedStatus = oneLine(patch.status, 30);
    const updated = {
      ...current.data,
      ...leadFields({ ...current.data, ...patch }),
      status: LEAD_STATUSES.includes(requestedStatus) ? requestedStatus : current.data.status,
      updatedAt: new Date().toISOString(),
    };
    const result = await store.setJSON(leadKey(normalizedId), updated, { onlyIfMatch: current.etag });
    if (result?.modified !== false) return updated;
  }
  throw new Error("This lead changed while it was being saved. Please try again.");
}
