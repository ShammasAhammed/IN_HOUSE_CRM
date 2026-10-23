// The assistant (Stage 9.2, D86): its tools run with the asker's own permissions.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiModel, AiRequest, AiResult, FileStorage } from "@/repositories";
import { createAdService } from "@/services/ads";
import { createResultService } from "@/services/results";
import { createKnowledgeService } from "@/services/knowledge";
import { createAiService } from "@/services/ai";
import { createAssetService } from "@/services/assets";
import { assistantTools, createAssistantService, type AssistantDeps } from "@/services/assistant";
import { createCapacityService } from "@/services/capacity";
import { createClientService } from "@/services/clients";
import { createContentService } from "@/services/content";
import { createDashboardService } from "@/services/dashboard";
import { createLeadService } from "@/services/leads";
import { createLeaveService } from "@/services/leave";
import { createPeopleService } from "@/services/people";
import { createProjectService } from "@/services/projects";
import { createTaskService } from "@/services/tasks";
import { createTimeService } from "@/services/time";
import { actorOf, addClient, addPerson, addProjectWithTask, addRetainer, addService, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-15");

/** A model that calls one tool, then answers with what the tool said. Keeps every request. */
function scripted(toolName: string, input: unknown): AiModel & { requests: AiRequest[] } {
  const requests: AiRequest[] = [];
  return {
    connected: true,
    provider: "test",
    model: "test-model",
    requests,
    async answer(req): Promise<AiResult> {
      requests.push(req);
      const tool = req.tools.find((t) => t.name === toolName);
      const out = tool ? await tool.run(input) : { ok: false, text: "no tool" };
      return { kind: "answer", outcome: "answered", text: out.text, toolCalls: [{ name: toolName, ok: out.ok }], usage: [] };
    },
  };
}

function deps(model: AiModel): AssistantDeps {
  const capacity = createCapacityService({ store, clock });
  return {
    ai: createAiService({ store, clock, model, inrPerUsd: 90 }),
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
    clock,
  };
}

let owner = "";
let designer = "";
let intern = "";
let hr = "";

beforeEach(async () => {
  await wipe(db);
  owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  designer = await addPerson(db, "Nikhil Das", ["designer"]);
  intern = await addPerson(db, "Meera K", ["intern"]);
  hr = await addPerson(db, "Lakshmi Menon", ["hr"]);
  const service = await addService(db);
  const zenith = await addClient(db, "Zenith IAS Academy", { members: [designer] });
  await addRetainer(db, zenith, service, { feePaise: 4_500_000, budgetMinutes: 2400, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  const bright = await addClient(db, "BrightPath College");
  await addRetainer(db, bright, service, { feePaise: 6_000_000, budgetMinutes: 3000, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  await addProjectWithTask(db, zenith, { ownerId: intern, dueDate: "2026-10-10" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

const run = async (personId: string, roles: Parameters<typeof actorOf>[1], toolName: string, input: unknown) => {
  const tools = assistantTools(actorOf(personId, roles), deps(scripted(toolName, input)));
  return tools.find((t) => t.name === toolName)!.run(input);
};

describe("the assistant's tools", () => {
  it("show the owner every client with fees in rupees", async () => {
    const r = await run(owner, ["owner"], "list_clients", {});
    expect(r.ok).toBe(true);
    expect(r.text).toContain("BrightPath College");
    expect(r.text).toContain("₹45,000");
  });

  it("show a designer only their clients, and never money", async () => {
    const r = await run(designer, ["designer"], "list_clients", {});
    expect(r.text).toContain("Zenith IAS Academy");
    expect(r.text).not.toContain("BrightPath");
    expect(r.text).not.toMatch(/₹|fee/i);
    const other = await run(designer, ["designer"], "client_overview", { client: "BrightPath" });
    expect(other).toMatchObject({ ok: false });
    expect(other.text).toMatch(/No client you can see/);
  });

  it("show an intern only their own tasks, and HR no client work", async () => {
    const mine = await run(intern, ["intern"], "list_tasks", { client: "", project_id: "", owner: "", status: "", overdue_only: true });
    expect(mine.text).toContain('"count":1');
    const hrTry = await run(hr, ["hr"], "list_clients", {});
    expect(hrTry).toMatchObject({ ok: false });
  });

  it("offer sales leads only to people who may see them", async () => {
    const names = (personId: string, roles: Parameters<typeof actorOf>[1]) => assistantTools(actorOf(personId, roles), deps(scripted("", {}))).map((t) => t.name);
    expect(names(designer, ["designer"])).not.toContain("list_leads");
    expect(names(owner, ["owner"])).toEqual(expect.arrayContaining(["list_leads", "lead_details", "sales_dashboard"]));
    const r = await run(owner, ["owner"], "sales_dashboard", { days: "30" });
    expect(r).toMatchObject({ ok: true });
    expect(r.text).toContain('"total":0');
  });

  it("read the knowledge base and search it within the asker's clients (11.2)", async () => {
    const kb = deps(scripted("", {})).knowledge;
    const [zenith, bright] = (await store.clients.list({ kind: "all" })).sort((a, b) => b.name.localeCompare(a.name));
    await kb.save(actorOf(owner, ["owner"]), { clientId: zenith!.id, version: "0", tone: "Warm, Malayalam first", donts: "- No fee talk" });
    await kb.addCampaign(actorOf(owner, ["owner"]), { clientId: bright!.id, name: "Open day", whatWorked: "Topper reels" });
    await kb.addCampaign(actorOf(owner, ["owner"]), { clientId: zenith!.id, name: "Prelims", whatWorked: "Topper reels" });
    const one = await run(designer, ["designer"], "client_knowledge", { client: "Zenith", search: "" });
    expect(one.text).toContain("Malayalam first");
    const found = await run(designer, ["designer"], "client_knowledge", { client: "", search: "topper reels" });
    expect(found.text).toContain("Prelims");
    expect(found.text).not.toContain("Open day");
    expect((await run(designer, ["designer"], "client_knowledge", { client: "", search: "" })).ok).toBe(false);
  });

  it("keep the owner dashboard for the owner", async () => {
    expect((await run(owner, ["owner"], "owner_dashboard", {})).ok).toBe(true);
    expect((await run(designer, ["designer"], "owner_dashboard", {})).ok).toBe(false);
  });

  it("are strict: every input listed as required, nothing extra", () => {
    for (const t of assistantTools(actorOf(owner, ["owner"]), deps(scripted("", {})))) {
      const schema = t.inputSchema as { properties: Record<string, unknown>; required?: string[]; additionalProperties: boolean };
      expect(schema.additionalProperties, t.name).toBe(false);
      expect([...(schema.required ?? [])].sort(), t.name).toEqual(Object.keys(schema.properties).sort());
    }
  });
});

describe("asking", () => {
  it("tells the model who is asking and the date, and logs the cost", async () => {
    const model = scripted("my_day", {});
    const assistant = createAssistantService(deps(model));
    const r = await assistant.ask(actorOf(intern, ["intern"]), { question: "What's overdue for me?", history: [{ role: "assistant", text: "stray" }] });
    if (!r.ok) throw new Error(r.error.message);
    const turns = model.requests[0]!.turns;
    expect(turns).toHaveLength(1);
    // "My work" is the default (12.4): a hint, the same tools.
    expect(turns[0]!.text).toMatch(/^\[Test person \(Intern\) · today is Thu, 15 Oct.*\]\n\[Mode: my work\..*\]\n\nWhat's overdue for me\?$/);
    expect(model.requests[0]!.system).not.toContain("2026");
    expect(await store.aiUsage.totals({ from: new Date("2026-10-01"), to: new Date("2026-11-01") })).toMatchObject({ questions: 1 });
  });

  it("asks about everything the person may see when they choose so, with the same tools", async () => {
    const model = scripted("my_day", {});
    const assistant = createAssistantService(deps(model));
    await assistant.ask(actorOf(intern, ["intern"]), { question: "Which clients are late?", history: [], mode: "all" });
    await assistant.ask(actorOf(intern, ["intern"]), { question: "What's late?", history: [] });
    expect(model.requests[0]!.turns[0]!.text).not.toContain("Mode: my work");
    expect(model.requests[1]!.turns[0]!.text).toContain("Mode: my work");
    expect(model.requests[0]!.tools.map((t) => t.name)).toEqual(model.requests[1]!.tools.map((t) => t.name));
  });

  it("refuses an empty question", async () => {
    const r = await createAssistantService(deps(scripted("my_day", {}))).ask(actorOf(owner, ["owner"]), { question: "  ", history: [] });
    expect(r.ok ? "" : r.error.code).toBe("invalid");
  });
});
