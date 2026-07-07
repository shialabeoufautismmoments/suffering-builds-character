import { getStore } from "@netlify/blobs";

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const store = () => getStore({ name: "coachsbc-workspace", consistency: "strong" });
const key = "shared/team-workspace-v2";

const normalizeCode = value => String(value || "").trim().toUpperCase();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const clean = (value, max = 5000) => String(value ?? "").slice(0, max);
const num = value => Number.isFinite(+value) ? +value : 0;

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

function clientView(workspace, client) {
  const clientId = client.id;
  const sessions = (workspace.sessions || []).filter(session => session.clientId === clientId);
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
      clientKovaaksStats: client.clientKovaaksStats || []
    },
    playlists: (workspace.playlists || []).filter(item => item.clientId === clientId),
    vods: publicVods,
    matches: (workspace.matches || []).filter(item => item.clientId === clientId),
    sessions: sessions.map(session => ({
      id: session.id,
      date: session.date || "",
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
  const data = {
    id,
    clientId: client.id,
    date: clean(input.date, 20) || today(),
    type: clean(input.type, 80) || "Competitive",
    result: ["Win", "Loss", "Draw"].includes(input.result) ? input.result : "Win",
    role: clean(input.role, 80),
    map: clean(input.map, 120),
    mode: clean(input.mode, 80),
    heroes: Array.isArray(input.heroes) ? input.heroes.map(hero => clean(hero, 80)).filter(Boolean).slice(0, 8) : [],
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
