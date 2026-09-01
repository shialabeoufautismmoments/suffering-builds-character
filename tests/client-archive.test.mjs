import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function archiveHarness() {
  const [store, clients] = await Promise.all([
    readFile(path.join(root, "apps/hq/js/store.js"), "utf8"),
    readFile(path.join(root, "apps/hq/js/clients.js"), "utf8"),
  ]);
  const context = vm.createContext({
    console,
    localStorage: { getItem: () => null, setItem: () => {} },
    Access: { currentCoachId: "coach-1" },
    UI: {
      renderers: {}, refresh: () => {}, updateClientPill: () => {}, toast: () => {},
      confirm: (_message, action) => action(), escape: value => String(value || ""),
      safeAvatar: () => "", initials: () => "?",
    },
    window: { api: { saveStore: async () => true } },
    setTimeout: action => { action(); return 1; },
    clearTimeout: () => {},
  });
  vm.runInContext(`${store}\n${clients}\nglobalThis.harness = { DB, Clients, activeClients, clientIsArchived };`, context);
  return context.harness;
}

test("archiving a client preserves linked records and selects another active client", async () => {
  const { DB, Clients, activeClients, clientIsArchived } = await archiveHarness();
  DB.coaches.push({ id: "coach-1" }, { id: "coach-2" });
  DB.clients.push(
    { id: "client-1", name: "Archive Me", coachId: "coach-1", packages: [] },
    { id: "client-2", name: "Keep Active", coachId: "coach-1", packages: [] },
  );
  DB.matches.push({ id: "match-1", clientId: "client-1", result: "Win" });
  DB.sessions.push({ id: "session-1", clientId: "client-1" });
  DB.vods.push({ id: "vod-1", clientId: "client-1" });
  DB.activeClientId = "client-1";

  Clients.archive("client-1");

  assert.equal(clientIsArchived(DB.clients[0]), true);
  assert.equal(DB.activeClientId, "client-2");
  assert.equal(activeClients().map(client => client.id).join(","), "client-2");
  assert.equal(DB.matches.length, 1);
  assert.equal(DB.sessions.length, 1);
  assert.equal(DB.vods.length, 1);
  assert.equal(Clients.visibleClients({ archived: true }).map(client => client.id).join(","), "client-1");
});

test("restoring a client returns it to active roster views", async () => {
  const { DB, Clients, activeClients } = await archiveHarness();
  DB.clients.push({ id: "client-1", name: "Come Back", archivedAt: "2026-09-01T12:00:00.000Z" });

  Clients.restore("client-1");

  assert.equal(DB.clients[0].archivedAt, undefined);
  assert.equal(activeClients().map(client => client.id).join(","), "client-1");
  assert.equal(Clients.visibleClients({ archived: true }).length, 0);
});
