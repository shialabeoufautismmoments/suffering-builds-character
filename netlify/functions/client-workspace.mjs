import { getStore } from "@netlify/blobs";
import { OVERWATCH_CATALOG } from "../../apps/shared/overwatch-catalog.mjs";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const store = () => getStore({ name: "coachsbc-workspace", consistency: "strong" });
const key = "shared/team-workspace-v2";

const normalizeCode = value => String(value || "").trim().toUpperCase();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const clean = (value, max = 5000) => String(value ?? "").slice(0, max);
const num = value => Number.isFinite(+value) ? +value : 0;
const discordIdFrom = value => /^(?:<@!?)?(\d{17,20})>?$/.exec(String(value || "").trim())?.[1] || "";

// The client app's match form takes role/map/heroes as free text. Canonical
// values come from the same catalog used by the client and Coach HQ so stats
// cannot drift between surfaces.
const OW_ROLES = ["Tank", "Damage", "Support"];
const OW_HERO_NAMES = OVERWATCH_CATALOG.heroes.map(hero => hero.name);
const OW_MAP_NAMES = OVERWATCH_CATALOG.maps.map(map => map.name);
const OW_MAP_MODE = Object.fromEntries(OVERWATCH_CATALOG.maps.map(map => [map.name, map.mode]));
// Case-insensitive match against a canonical list; falls back to the value
// as typed if it's not recognized (a typo or a hero/map not yet in the list
// shouldn't get silently dropped).
const canonicalize = (value, list) => {
  const v = String(value ?? "").trim();
  if (!v) return v;
  return list.find(x => x.toLowerCase() === v.toLowerCase()) || v;
};

function findClient(workspace, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return (workspace.clients || []).find(client => normalizeCode(client.clientCode) === normalized) || null;
}

function publicPlan(plan) {
  return {
    id: plan.id,
    title: plan.title || "",
    status: plan.status || "",
    startDate: plan.startDate || "",
    endDate: plan.endDate || "",
    objective: plan.objective || "",
    focusAreas: plan.focusAreas || [],
    goals: (plan.goals || []).map(goal => ({
      id: goal.id,
      title: goal.title || "",
      metricKey: goal.metricKey || "custom",
      current: goal.current ?? 0,
      target: goal.target ?? 0,
      unit: goal.unit || "",
      dueDate: goal.dueDate || "",
      history: goal.history || []
    })),
    actions: (plan.actions || []).map(action => ({
      id: action.id,
      title: action.title || "",
      type: action.type || "Other",
      targetPerWeek: action.targetPerWeek || 1,
      completions: action.completions || []
    })),
    reviewNotes: plan.reviewNotes || ""
  };
}

function publicTeam(workspace, client) {
  const team = (workspace.teams || []).find(item => item.id === client.teamId || (!client.teamId && client.team && item.name === client.team));
  if (!team) return null;
  const memberIds = new Set(team.clientIds || []);
  const roster = (workspace.clients || []).filter(member => memberIds.has(member.id) || member.teamId === team.id).map(member => ({
    id: member.id, name: member.name || "Player", role: member.role || "", rank: member.rank || "", avatar: member.avatar || ""
  }));
  const coaches = (team.coachIds || []).map(id => (workspace.coaches || []).find(coach => coach.id === id)).filter(Boolean).map(coach => ({
    id: coach.id, name: coach.name || "Coach", role: coach.role || "", color: coach.color || ""
  }));
  return {
    id: team.id, name: team.name || "Team", game: team.game || "", division: team.division || "", season: team.season || "", objective: team.objective || "",
    roster, coaches,
    goals: (team.goals || []).map(goal => ({ id: goal.id, text: goal.text || "", owner: goal.owner || "", dueDate: goal.dueDate || "", done: !!goal.done })),
    scrims: (team.scrims || []).map(scrim => ({ id: scrim.id, date: scrim.date || "", time: scrim.time || "", opponent: scrim.opponent || "", format: scrim.format || "", status: scrim.status || "Scheduled", result: scrim.result || "", mapPool: scrim.mapPool || "", notes: scrim.notes || "" })),
    mapPool: (team.mapPool || []).map(entry => ({ id: entry.id, map: entry.map || "", priority: entry.priority || "", attackComp: entry.attackComp || "", defenseComp: entry.defenseComp || "", notes: entry.notes || "" })),
    compositions: (team.compositions || []).map(comp => ({ id: comp.id, name: comp.name || "", map: comp.map || "", mode: comp.mode || "", lineup: comp.lineup || "", notes: comp.notes || "" })),
  };
}

function clientView(workspace, client) {
  const clientId = client.id;
  const sessions = (workspace.sessions || []).filter(session => session.clientId === clientId);
  const feedback = (workspace.feedback || []).filter(item => item.clientId === clientId).map(item => ({
    id: item.id,
    sessionId: item.sessionId,
    rating: num(item.rating),
    privateNote: item.privateNote || "",
    issue: !!item.issue,
    issueDetails: item.issueDetails || "",
    testimonialAllowed: !!item.testimonialAllowed,
    publicQuote: item.testimonialAllowed ? item.publicQuote || "" : "",
    status: item.status || "new",
    coachResponse: item.coachResponse || "",
    createdAt: item.createdAt || "",
    updatedAt: item.updatedAt || ""
  }));
  const scheduled = (workspace.scheduled || []).filter(item => item.clientId === clientId && !item.done)
    .map(item => ({ id: item.id, date: item.date || "", time: item.time || "", notes: item.notes || "" }));
  const packages = (client.packages || []).map(p => ({
    name: p.name || "Package",
    total: num(p.total),
    used: num(p.used),
    remaining: Math.max(0, num(p.total) - num(p.used))
  }));
  const sessionsRemaining = packages.reduce((sum, p) => sum + p.remaining, 0);
  const referralRewards = (workspace.referrals || []).filter(item => item.referrerClientId === clientId).map(item => ({
    id: item.id, status: item.status || "Pending", rewardLabel: item.rewardLabel || "Referral reward", createdAt: item.createdAt || "", fulfilledAt: item.fulfilledAt || ""
  }));
  const publicVods = (workspace.vods || []).filter(item => item.clientId === clientId).map(vod => ({
    id: vod.id,
    title: vod.title || "",
    reviewStatus: vod.reviewStatus || "",
    platform: vod.platform || "",
    videoId: vod.videoId || "",
    url: vod.url || "",
    date: vod.date || "",
    scenario: vod.scenario || "",
    summary: vod.summary || "",
    source: vod.source || "",
    clientStatus: vod.clientStatus || "",
    clientViewedAt: vod.clientViewedAt || "",
    createdAt: vod.createdAt || "",
    updatedAt: vod.updatedAt || "",
    notes: (vod.notes || []).map(note => ({
      id: note.id,
      t: note.t || 0,
      title: note.title || "",
      text: note.text || "",
      tag: note.tag || "",
      severity: note.severity || "",
      sourceUrl: note.sourceUrl || "",
      homework: note.homework || "",
      homeworkDue: note.homeworkDue || "",
      clientPrompt: note.clientPrompt || "",
      clientReplies: note.clientReplies || [],
      imageDataUrl: note.imageDataUrl || "",
      gifDataUrl: note.gifDataUrl || "",
      clipDataUrl: note.clipDataUrl || ""
    }))
  }));
  return {
    cloud: workspace.cloud || { revision: 0, updatedAt: null },
    client: {
      id: client.id,
      name: client.name || "",
      game: client.game || "",
      rank: client.rank || "",
      notes: client.notes || "",
      goals: client.goals || [],
      prs: client.prs || {},
      prHistory: client.prHistory || {},
      clientKovaaksStats: client.clientKovaaksStats || [],
      discordId: client.discordId || "",
      avatar: client.avatar || "",
      sessionRequests: client.sessionRequests || [],
      clientNotes: client.clientNotes || [],
      packages,
      sessionsRemaining
    },
    playlists: (workspace.playlists || []).filter(item => item.clientId === clientId),
    vods: publicVods,
    matches: (workspace.matches || []).filter(item => item.clientId === clientId),
    scheduled,
    feedback,
    team: publicTeam(workspace, client),
    referralProgram: {
      code: client.referralCode || "",
      total: referralRewards.length,
      pending: referralRewards.filter(item => ["Pending", "Approved"].includes(item.status)).length,
      fulfilled: referralRewards.filter(item => item.status === "Fulfilled").length,
      rewards: referralRewards,
    },
    sessions: sessions.map(session => ({
      id: session.id,
      date: session.date || "",
      durationMin: num(session.durationMin),
      topics: session.topics || "",
      notes: session.notes || "",
      homework: (session.homework || []).map(homework => ({
        id: homework.id,
        text: homework.text || "",
        type: homework.type || "other",
        dueDate: homework.dueDate || "",
        done: !!homework.done,
        clientNote: homework.clientNote || "",
        clientCompletedAt: homework.clientCompletedAt || ""
      }))
    })),
    developmentPlans: (client.developmentPlans || []).map(publicPlan)
  };
}

function applyMatch(workspace, client, input) {
  workspace.matches ||= [];
  const id = clean(input.id, 80) || uid();
  const existing = workspace.matches.find(match => match.id === id && match.clientId === client.id);
  const result = canonicalize(input.result, ["Win", "Loss", "Draw"]);
  const map = canonicalize(clean(input.map, 120), OW_MAP_NAMES);
  const data = {
    id,
    clientId: client.id,
    date: clean(input.date, 20) || today(),
    type: clean(input.type, 80) || "Competitive",
    result: ["Win", "Loss", "Draw"].includes(result) ? result : "Win",
    role: canonicalize(clean(input.role, 80), OW_ROLES),
    map,
    mode: OW_MAP_MODE[map] || clean(input.mode, 80),
    heroes: Array.isArray(input.heroes)
      ? input.heroes.map(hero => canonicalize(clean(hero, 80), OW_HERO_NAMES)).filter(Boolean).slice(0, 8)
      : [],
    rankBefore: clean(input.rankBefore, 120),
    rankAfter: clean(input.rankAfter, 120),
    replayCode: clean(input.replayCode, 40),
    notes: clean(input.notes),
    source: "client-app",
    updatedAt: new Date().toISOString()
  };
  if (existing) Object.assign(existing, data);
  else workspace.matches.push({ ...data, createdAt: new Date().toISOString() });
}

function applyKovaaksStat(client, input) {
  client.clientKovaaksStats ||= [];
  client.prs ||= {};
  client.prHistory ||= {};
  client.activity ||= {};
  const scenario = clean(input.scenario, 180).trim();
  if (!scenario) return;
  const score = num(input.score);
  const date = clean(input.date, 20) || today();
  const id = clean(input.id, 80) || uid();
  const data = {
    id,
    date,
    scenario,
    score,
    accuracy: input.accuracy === "" || input.accuracy == null ? null : num(input.accuracy),
    notes: clean(input.notes, 2000),
    source: "client-app",
    updatedAt: new Date().toISOString()
  };
  const existing = client.clientKovaaksStats.find(row => row.id === id);
  if (existing) Object.assign(existing, data);
  else client.clientKovaaksStats.push({ ...data, createdAt: new Date().toISOString() });

  const previous = client.prs[scenario];
  if (!previous || score >= num(previous.pr)) {
    client.prs[scenario] = { pr: score, plays: Math.max(1, num(previous?.plays) + 1), lastDate: date, source: "client-app" };
    (client.prHistory[scenario] ||= []).push({ d: date, pr: score, source: "client-app" });
  } else if (previous) {
    previous.plays = Math.max(1, num(previous.plays) + 1);
  }
  client.activity[date.replace(/-/g, ".")] = num(client.activity[date.replace(/-/g, ".")]) + 1;
}

// Rebuilds a scenario's PR + PR-history from the client's remaining stats,
// after a delete/edit. Only ever touches client-app-sourced PRs so it can't
// clobber values the coach set. Without this, deleting a mis-logged record
// score would leave the inflated PR standing (the normal add path only ever
// raises the PR, never lowers it).
function recomputeClientPr(client, scenario) {
  if (!scenario) return;
  client.prs ||= {};
  client.prHistory ||= {};
  const existing = client.prs[scenario];
  if (existing && existing.source !== "client-app") return;
  const rows = (client.clientKovaaksStats || [])
    .filter(stat => stat.scenario === scenario)
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  if (!rows.length) {
    delete client.prs[scenario];
    delete client.prHistory[scenario];
    return;
  }
  let runningMax = -Infinity, lastDate = "";
  const history = [];
  rows.forEach(row => {
    const score = num(row.score);
    if (score > runningMax) {
      runningMax = score;
      history.push({ d: row.date, pr: score, source: "client-app" });
    }
    lastDate = row.date || lastDate;
  });
  client.prs[scenario] = { pr: runningMax, plays: rows.length, lastDate, source: "client-app" };
  client.prHistory[scenario] = history;
}

// Removes client-created matches by id — never coach-logged ones.
function deleteMatches(workspace, client, ids) {
  const del = new Set(ids.map(id => clean(id, 80)).filter(Boolean));
  if (!del.size) return;
  workspace.matches = (workspace.matches || []).filter(match =>
    !(match.clientId === client.id && match.source === "client-app" && del.has(match.id)));
}

// Removes client-created KovaaK's stats by id, then recomputes any affected
// scenario's PR from what's left.
function deleteKovaaksStats(client, ids) {
  const del = new Set(ids.map(id => clean(id, 80)).filter(Boolean));
  if (!del.size) return;
  const touched = new Set();
  (client.clientKovaaksStats || []).forEach(stat => {
    if (del.has(stat.id) && stat.source === "client-app") touched.add(stat.scenario);
  });
  client.clientKovaaksStats = (client.clientKovaaksStats || []).filter(stat =>
    !(del.has(stat.id) && stat.source === "client-app"));
  touched.forEach(scenario => recomputeClientPr(client, scenario));
}

// Same base64 data-URL restriction HQ's own UI.safeAvatar enforces - never
// store a bare remote URL (Discord CDN links expire/rotate) or anything
// that isn't actually image bytes.
const safeAvatar = value => /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(String(value || "")) ? String(value) : "";

function applyAvatar(client, input) {
  const avatar = safeAvatar(input.avatarDataUrl);
  if (!avatar) return;
  client.avatar = avatar;
  const id = discordIdFrom(input.discordId);
  if (id) client.discordId = id;
}

function applySessionRequest(client, input) {
  client.sessionRequests ||= [];
  const message = clean(input.message, 2000).trim();
  const preferredTimes = clean(input.preferredTimes, 300).trim();
  if (!message && !preferredTimes) return;
  client.sessionRequests.push({
    id: clean(input.id, 80) || uid(),
    message,
    preferredTimes,
    status: "open",
    source: "client-app",
    createdAt: new Date().toISOString()
  });
}

function applyClientNote(client, input) {
  client.clientNotes ||= [];
  const text = clean(input.text, 4000).trim();
  if (!text) return;
  client.clientNotes.push({
    id: clean(input.id, 80) || uid(),
    text,
    source: "client-app",
    createdAt: new Date().toISOString()
  });
}

function applySessionFeedback(workspace, client, input) {
  const sessionId = clean(input.sessionId, 80);
  const session = (workspace.sessions || []).find(item => item.id === sessionId && item.clientId === client.id);
  const rating = Math.trunc(num(input.rating));
  if (!session || num(session.durationMin) <= 0 || rating < 1 || rating > 5) return;
  workspace.feedback ||= [];
  const existing = workspace.feedback.find(item => item.clientId === client.id && item.sessionId === sessionId);
  const now = new Date().toISOString();
  const testimonialAllowed = !!input.testimonialAllowed;
  const issue = !!input.issue;
  const publicQuote = testimonialAllowed ? clean(input.publicQuote, 1800) : "";
  const quoteNeedsReview = !existing?.testimonialAllowed || publicQuote !== (existing?.publicQuote || "");
  const data = {
    id: existing?.id || clean(input.id, 80) || uid(),
    clientId: client.id,
    sessionId,
    coachId: existing?.coachId || session.coachId || client.coachId || "",
    rating,
    privateNote: clean(input.privateNote, 4000),
    issue,
    issueDetails: issue ? clean(input.issueDetails, 3000) : "",
    testimonialAllowed,
    publicQuote,
    priority: issue || rating <= 2 ? "high" : rating === 3 ? "normal" : "low",
    status: "new",
    publicationStatus: testimonialAllowed
      ? (quoteNeedsReview ? "Not reviewed" : existing?.publicationStatus || "Not reviewed")
      : "Permission not granted",
    permissionUpdatedAt: now,
    source: "client-app",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (existing) Object.assign(existing, data);
  else workspace.feedback.push(data);
}

function applyHomework(workspace, client, input) {
  const session = (workspace.sessions || []).find(item => item.clientId === client.id && item.id === input.sessionId);
  const homework = session && (session.homework || []).find(item => item.id === input.homeworkId);
  if (!homework) return;
  homework.done = !!input.done;
  homework.clientNote = clean(input.note, 2000);
  homework.clientCompletedAt = input.done ? new Date().toISOString() : "";
  session.updatedAt = new Date().toISOString();
}

function applyAction(client, input) {
  const plan = (client.developmentPlans || []).find(item => item.id === input.planId);
  const action = plan && (plan.actions || []).find(item => item.id === input.actionId);
  if (!action) return;
  action.completions ||= [];
  action.completions.push({
    id: uid(),
    date: clean(input.date, 20) || today(),
    at: new Date().toISOString(),
    note: clean(input.note, 2000),
    source: "client-app"
  });
}

function applyGoal(client, input) {
  const plan = (client.developmentPlans || []).find(item => item.id === input.planId);
  const goal = plan && (plan.goals || []).find(item => item.id === input.goalId);
  if (!goal) return;
  const value = num(input.value);
  goal.current = value;
  goal.history ||= [];
  goal.history.push({
    id: uid(),
    date: clean(input.date, 20) || today(),
    value,
    note: clean(input.note, 2000),
    source: "client-app"
  });
}

function applyVodWatched(workspace, client, input) {
  const vod = (workspace.vods || []).find(item => item.clientId === client.id && item.id === input.vodId);
  if (!vod) return;
  vod.clientStatus = "watched";
  vod.clientViewedAt = new Date().toISOString();
  vod.updatedAt = new Date().toISOString();
}

function applyVodReply(workspace, client, input) {
  const vod = (workspace.vods || []).find(item => item.clientId === client.id && item.id === input.vodId);
  const note = vod && (vod.notes || []).find(item => item.id === input.noteId);
  const text = clean(input.text, 3000).trim();
  if (!vod || !note || !text) return;
  note.clientReplies ||= [];
  note.clientReplies.push({
    id: uid(),
    text,
    at: new Date().toISOString(),
    source: "client-app"
  });
  vod.clientViewedAt ||= new Date().toISOString();
  vod.clientStatus = "client-replied";
  vod.updatedAt = new Date().toISOString();
}

export default async (request) => {
  const workspace = await store().get(key, { type: "json" }) || null;
  if (!workspace) return json({ error: "The coaching workspace has not been synced yet." }, 404);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const code = normalizeCode(request.headers.get("x-client-code") || url.searchParams.get("code"));
    const client = findClient(workspace, code);
    if (!client) return json({ error: "Invalid client code." }, 401);
    return json({ data: clientView(workspace, client) });
  }

  if (request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const client = findClient(workspace, body.code);
    if (!client) return json({ error: "Invalid client code." }, 401);
    const changes = body.changes || {};
    (changes.matches || []).slice(0, 25).forEach(match => applyMatch(workspace, client, match));
    (changes.kovaaksStats || []).slice(0, 50).forEach(stat => applyKovaaksStat(client, stat));
    (changes.homework || []).slice(0, 50).forEach(item => applyHomework(workspace, client, item));
    (changes.actionCompletions || []).slice(0, 50).forEach(item => applyAction(client, item));
    (changes.goalCheckIns || []).slice(0, 50).forEach(item => applyGoal(client, item));
    (changes.vodWatched || []).slice(0, 25).forEach(item => applyVodWatched(workspace, client, item));
    (changes.vodReplies || []).slice(0, 50).forEach(item => applyVodReply(workspace, client, item));
    (changes.sessionRequests || []).slice(0, 10).forEach(item => applySessionRequest(client, item));
    (changes.clientNotes || []).slice(0, 10).forEach(item => applyClientNote(client, item));
    (changes.sessionFeedback || []).slice(0, 10).forEach(item => applySessionFeedback(workspace, client, item));
    if (changes.avatar) applyAvatar(client, changes.avatar);
    // Deletes run after adds so an edit (delete old id + add new) leaves the
    // recomputed PR reflecting the new value.
    deleteMatches(workspace, client, (changes.deleteMatches || []).slice(0, 50));
    deleteKovaaksStats(client, (changes.deleteKovaaksStats || []).slice(0, 50));
    client.updatedAt = new Date().toISOString();
    workspace.cloud = {
      ...(workspace.cloud || {}),
      revision: Number(workspace.cloud?.revision || 0) + 1,
      updatedAt: new Date().toISOString()
    };
    await store().setJSON(key, workspace);
    return json({ data: clientView(workspace, client) });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config = { path: "/api/client-workspace" };
