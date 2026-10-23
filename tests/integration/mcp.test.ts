// The Oppllo MCP (Stage 9.3, D87): OAuth sign-in for AI apps, and tools that act with the person's own permissions.
import { createHash } from "node:crypto";
import * as schema from "@/db/schema";
import { newId } from "@/lib/id";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiModel, FileStorage } from "@/repositories";
import { createAdService } from "@/services/ads";
import { createResultService } from "@/services/results";
import { createKnowledgeService } from "@/services/knowledge";
import { createAiService } from "@/services/ai";
import { createAssetService } from "@/services/assets";
import { createCapacityService } from "@/services/capacity";
import { createClientService } from "@/services/clients";
import { createContentService } from "@/services/content";
import { createDashboardService } from "@/services/dashboard";
import { createLeadService } from "@/services/leads";
import { createLeaveService } from "@/services/leave";
import { createMcpService } from "@/services/mcp";
import { allowedRedirect, createMcpAuthService } from "@/services/mcp-auth";
import { createPeopleService } from "@/services/people";
import { createProjectService } from "@/services/projects";
import { createTaskService } from "@/services/tasks";
import { createTimeService } from "@/services/time";
import { actorOf, addClient, addPerson, addProjectWithTask, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
let now = new Date("2026-10-15T06:30:00Z");
const clock = { ...fixedClock("2026-10-15"), now: () => now };
const auth = createMcpAuthService({ store, clock });
const capacity = createCapacityService({ store, clock });
const mcp = createMcpService({
  store,
  clock,
  ai: createAiService({ store, clock, model: { connected: false } as AiModel, inrPerUsd: 90 }),
  clients: createClientService({ store, clock }),
  projects: createProjectService({ store, clock }),
  tasks: createTaskService({ store, clock }),
  capacity,
  time: createTimeService({ store, clock }),
  leave: createLeaveService({ store, clock }),
  people: createPeopleService({ store, clock }),
  assets: createAssetService({ store, clock, storage: {} as FileStorage }),
  content: createContentService({ store, clock }),
  dashboard: createDashboardService({ store, clock, capacity }),
    leads: createLeadService({ store, clock, crmConnected: false }),
    ads: createAdService({ store, clock, meta: { connected: false, insights: async () => { throw new Error("off"); } } }),
    results: createResultService({ store, clock, ads: { forClient: async () => ({ ok: true, value: { state: "not_connected" } }) } }),
    knowledge: createKnowledgeService({ store, clock, storage: {} as FileStorage }),
});

const verifier = "a-long-random-verifier-string-for-pkce-0123456789abcdef";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

let owner = "";
let designer = "";
let project = { projectId: "", taskId: "" };
let empty = "";

beforeEach(async () => {
  await wipe(db);
  now = new Date("2026-10-15T06:30:00Z");
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  const zenith = await addClient(db, "Zenith IAS Academy");
  project = await addProjectWithTask(db, zenith, { ownerId: owner });
  // A project without fixture tasks, so new tasks get a fresh board position.
  empty = newId();
  await db.insert(schema.projects).values({ id: empty, clientId: zenith, name: "Admissions 2027" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

async function connect(personId: string) {
  const reg = await auth.register({ client_name: "Claude", redirect_uris: [REDIRECT] });
  if (!reg.ok) throw new Error(reg.error.error_description);
  const clientId = String(reg.value.client_id);
  const req = { clientId, redirectUri: REDIRECT, codeChallenge: challenge, codeChallengeMethod: "S256", state: "xyz", resource: null };
  const approved = await auth.approve(actorOf(personId, ["owner"]), req);
  if (!approved.ok) throw new Error(approved.error.message);
  const url = new URL(approved.value.redirect);
  return { clientId, code: url.searchParams.get("code")!, state: url.searchParams.get("state") };
}

describe("signing an AI app in", () => {
  it("runs the whole flow: register, approve, code for tokens, refresh, disconnect", async () => {
    const { clientId, code, state } = await connect(owner);
    expect(state).toBe("xyz");
    const t = await auth.token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId });
    if (!t.ok) throw new Error(t.error.error_description);
    const who = await auth.authenticate(t.value.access_token);
    expect(who).toMatchObject({ personId: owner, appName: "Claude" });

    // A code works once.
    const again = await auth.token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: clientId });
    expect(again.ok ? "" : again.error.error).toBe("invalid_grant");

    // Refreshing replaces both tokens; the old ones stop working.
    const r = await auth.token({ grant_type: "refresh_token", refresh_token: t.value.refresh_token, client_id: clientId });
    if (!r.ok) throw new Error(r.error.error_description);
    expect(await auth.authenticate(t.value.access_token)).toBeNull();
    const reuse = await auth.token({ grant_type: "refresh_token", refresh_token: t.value.refresh_token, client_id: clientId });
    expect(reuse.ok).toBe(false);

    // Access tokens last an hour.
    now = new Date(now.getTime() + 61 * 60_000);
    expect(await auth.authenticate(r.value.access_token)).toBeNull();

    const list = await auth.connections(actorOf(owner, ["owner"]));
    if (!list.ok) throw new Error();
    expect(list.value.mine).toHaveLength(1);
    const peek = await auth.revoke(actorOf(designer, ["designer"]), list.value.mine[0]!.id);
    expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
    expect((await auth.revoke(actorOf(owner, ["owner"]), list.value.mine[0]!.id)).ok).toBe(true);
    const r2 = await auth.token({ grant_type: "refresh_token", refresh_token: r.value.refresh_token, client_id: clientId });
    expect(r2.ok).toBe(false);
    const events = await eventsFor(db, list.value.mine[0]!.id);
    expect(events.map((e) => e.action)).toEqual(["mcp.connected", "mcp.disconnected"]);
  });

  it("refuses a wrong PKCE verifier, another redirect, and plain challenges", async () => {
    const { clientId, code } = await connect(owner);
    const bad = await auth.token({ grant_type: "authorization_code", code, code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier-123", redirect_uri: REDIRECT, client_id: clientId });
    expect(bad.ok ? "" : bad.error.error).toBe("invalid_grant");
    const elsewhere = await auth.checkAuthorize({ clientId, redirectUri: "https://evil.example/cb", codeChallenge: challenge, codeChallengeMethod: "S256", state: null, resource: null });
    expect(elsewhere).toMatchObject({ ok: false, show: expect.stringMatching(/didn't register/) });
    const plain = await auth.checkAuthorize({ clientId, redirectUri: REDIRECT, codeChallenge: challenge, codeChallengeMethod: "plain", state: "s", resource: null });
    expect(plain).toMatchObject({ ok: false, redirect: expect.stringContaining("error=invalid_request") });
  });

  it("only registers https redirects, or http back to this computer", async () => {
    expect(allowedRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(allowedRedirect("http://localhost:6274/oauth/callback")).toBe(true);
    expect(allowedRedirect("http://evil.example/cb")).toBe(false);
    expect(allowedRedirect("javascript:alert(1)")).toBe(false);
    expect((await auth.register({ client_name: "x", redirect_uris: ["http://evil.example/cb"] })).ok).toBe(false);
  });
});

describe("the MCP tools", () => {
  it("act with the person's own permissions and are audited", async () => {
    const run = (personId: string, roles: Parameters<typeof actorOf>[1], name: string, input: unknown) => mcp.tools(actorOf(personId, roles)).find((t) => t.name === name)!.run(input);
    const made = await run(owner, ["owner"], "create_task", { project_id: empty, title: "Admission poster", description: "", owner: "me", due_date: "2026-10-20" });
    expect(made).toMatchObject({ ok: true });
    expect(made.text).toContain("Task created.");
    // The designer isn't on this client: the service refuses, as on the screens.
    const refused = await run(designer, ["designer"], "create_task", { project_id: empty, title: "Sneaky", description: "", owner: "", due_date: "" });
    expect(refused.ok).toBe(false);
    const logged = await run(owner, ["owner"], "log_time", { task_id: project.taskId, minutes: 30, work_date: "", note: "Call" });
    expect(logged.ok).toBe(true);

    await mcp.audit(actorOf(owner, ["owner"]), "01a00000-0000-7000-8000-000000000001", "log_time", true);
    const events = await eventsFor(db, "01a00000-0000-7000-8000-000000000001");
    expect(events[0]).toMatchObject({ action: "mcp.tool_used" });
  });

  it("are all strict", () => {
    for (const t of mcp.tools(actorOf(owner, ["owner"]))) {
      const s = t.inputSchema as { properties: Record<string, unknown>; required?: string[]; additionalProperties: boolean };
      expect(s.additionalProperties, t.name).toBe(false);
      expect([...(s.required ?? [])].sort(), t.name).toEqual(Object.keys(s.properties).sort());
    }
  });
});
