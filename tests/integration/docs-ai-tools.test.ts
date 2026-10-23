// Docs and meetings for AI (Stage 13.4): the Ask/MCP tools read only what the person can open (private spaces stay
// private) and work with no AI key; the AI helpers refuse cleanly without one, use their own feature names when on,
// and notes from a transcript need everyone's recording consent.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { AiModel, AiRequest, AiResult, FileStorage } from "@/repositories";
import { createAdService } from "@/services/ads";
import { createAiService } from "@/services/ai";
import { createAssetService } from "@/services/assets";
import { assistantTools, type AssistantDeps } from "@/services/assistant";
import { createCapacityService } from "@/services/capacity";
import { createClientService } from "@/services/clients";
import { createContentService } from "@/services/content";
import { createDashboardService } from "@/services/dashboard";
import { createDocAiService } from "@/services/doc-ai";
import { createDocTablesService } from "@/services/doc-tables";
import { createDocService } from "@/services/docs";
import { createKnowledgeService } from "@/services/knowledge";
import { createLeadService } from "@/services/leads";
import { createLeaveService } from "@/services/leave";
import { createMeetingService } from "@/services/meetings";
import { createPeopleService } from "@/services/people";
import { createProjectService } from "@/services/projects";
import { createResultService } from "@/services/results";
import { createTaskService } from "@/services/tasks";
import { createTimeService } from "@/services/time";
import { actorOf, addClient, addPerson, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = { today: () => "2026-10-21", now: () => new Date("2026-10-21T06:30:00Z") };
const docs = createDocService({ store, clock });
const tasks = createTaskService({ store, clock });
const docTables = createDocTablesService({ store, clock, docs });
const meetings = createMeetingService({ store, clock, docs, tasks });

/** A model that answers "done" and keeps what it was asked. */
function fakeModel(provider = "gemini"): AiModel & { asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    connected: true,
    provider,
    model: "test-model",
    asked,
    async answer(req): Promise<AiResult> {
      asked.push(req);
      return { kind: "answer", outcome: "answered", text: "- [ ] @Nikhil Das send the plan by Friday\nnot a line", toolCalls: [], usage: [{ model: "test-model", inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0, costMicroUsd: 1000 }] } as AiResult;
    },
  };
}
const docAi = (model?: AiModel) => createDocAiService({ store, ai: createAiService({ store, clock, ...(model ? { model } : {}), inrPerUsd: 90 }), docs, meetings });

function deps(): AssistantDeps {
  const capacity = createCapacityService({ store, clock });
  return {
    ai: createAiService({ store, clock, inrPerUsd: 90 }),
    clients: createClientService({ store, clock }),
    projects: createProjectService({ store, clock }),
    tasks,
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
    docs,
    docTables,
    meetings,
    clock,
  };
}

const ids = { strategist: "", designer: "", marketer: "", zenith: "", founder: "" };
const named = (id: string, roles: Parameters<typeof actorOf>[1], fullName: string) => ({ ...actorOf(id, roles), fullName });
const strategist = () => named(ids.strategist, ["strategist"], "Anjali Nair");
const designer = () => named(ids.designer, ["designer"], "Nikhil Das");
const marketer = () => named(ids.marketer, ["performance_marketer"], "Rahul Krishnan");
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error!.code);
function value<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
async function run(actor: ReturnType<typeof designer>, name: string, input: unknown) {
  const t = assistantTools(actor, deps()).find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t.run(input);
}
async function decide(actor: ReturnType<typeof designer>, meetingId: string, decision: string) {
  const m = value(await meetings.get(actor, meetingId));
  value(await docs.update(actor, { docId: m.docId, version: m.docVersion, title: m.title, body: m.body.replace("## Decisions\n\n- ", `## Decisions\n\n- ${decision}`) }));
}

beforeEach(async () => {
  await wipe(db);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.marketer = await addPerson(db, "Rahul Krishnan", ["performance_marketer"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist, members: [ids.designer] });
  ids.founder = newId();
  await db.insert(s.clients).values({ id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" });
  await db.insert(s.clientMembers).values([
    { clientId: ids.founder, personId: ids.designer, level: "edit" },
    { clientId: ids.founder, personId: ids.marketer, level: "view" },
  ]);
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("Ask and MCP tools for docs and meetings (no AI key needed)", () => {
  it("read only what the person can open", async () => {
    const z = value(await meetings.create(strategist(), { title: "Zenith weekly", clientId: ids.zenith, kind: "client_call", meetingDate: "2026-10-21", attendees: [ids.designer] }));
    await decide(strategist(), z.id, "Budget stays at 50,000");
    const f = value(await meetings.create(designer(), { title: "Founder sync", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-20" }));
    await decide(designer(), f.id, "Hire a video editor");
    const fDoc = value(await meetings.get(designer(), f.id)).docId;
    value(await docTables.create(designer(), { docId: fDoc }));

    expect((await run(designer(), "meeting_decisions", { client: "", search: "" })).text).toContain("Hire a video editor");
    const strat = await run(strategist(), "meeting_decisions", { client: "", search: "" });
    expect(strat.text).toContain("Budget stays at 50,000");
    expect(strat.text).not.toContain("video editor");
    expect((await run(strategist(), "meeting_decisions", { client: "Founder", search: "" })).ok).toBe(false); // can't even name it
    expect((await run(strategist(), "list_meetings", { client: "", kind: "", from: "", to: "" })).text).not.toContain("Founder sync");
    expect((await run(designer(), "list_meetings", { client: "Founder office", kind: "internal", from: "", to: "" })).text).toContain("Founder sync");
    expect((await run(designer(), "search_docs", { search: "video editor" })).text).toContain("Founder sync");
    expect((await run(strategist(), "search_docs", { search: "video editor" })).text).toBe("No page matches.");
    const read = await run(marketer(), "read_doc", { doc_id: fDoc }); // view level reads
    expect(read.ok).toBe(true);
    expect(read.text).toContain("Hire a video editor");
    expect(read.text).toContain('"tables"');
    expect((await run(strategist(), "read_doc", { doc_id: fDoc })).ok).toBe(false);
    const items = await run(designer(), "meeting_action_items", { client: "", include_done: "no" });
    expect(items.ok).toBe(true);
  });
});

describe("AI in docs and meetings", () => {
  it("refuses cleanly without a key; everything else works", async () => {
    const { id } = value(await docs.create(designer(), { title: "Plan", body: "Some words" }));
    const off = docAi();
    const r = await off.write(designer(), { docId: id, mode: "shorten", text: "Some words here" });
    expect(r.ok ? "" : r.error.message).toMatch(/isn't switched on yet/);
    const m = value(await meetings.create(designer(), { title: "Sync", kind: "internal", meetingDate: "2026-10-21" }));
    expect(code(await off.summary(designer(), m.id))).toBe("forbidden");
    expect(code(await off.suggestActions(designer(), m.id))).toBe("forbidden");
  });

  it("when on: its own feature names, Malayalam asked for by name, view level can't write, items as lines only", async () => {
    const model = fakeModel();
    const ai = docAi(model);
    const { id } = value(await docs.create(designer(), { title: "Plan", body: "x", clientId: ids.founder }));
    value(await ai.write(designer(), { docId: id, mode: "translate", text: "Admissions open", ask: "ml" }));
    expect(model.asked[0]!.turns[0]!.text).toContain("Malayalam");
    expect(code(await ai.write(marketer(), { docId: id, mode: "shorten", text: "Admissions open" }))).toBe("forbidden");
    expect(code(await ai.write(designer(), { docId: id, mode: "shorten", text: "" }))).toBe("invalid");
    const m = value(await meetings.create(designer(), { title: "Sync", clientId: ids.founder, kind: "internal", meetingDate: "2026-10-21", attendees: [ids.designer] }));
    expect(value(await ai.suggestActions(designer(), m.id)).items).toEqual(["- [ ] @Nikhil Das send the plan by Friday"]);
    const features = await db.execute<{ feature: string }>(sql`select feature from ai_usage order by created_at`);
    expect(features.map((f) => f.feature)).toEqual(["doc_translate", "meeting_actions"]);
  });

  it("notes from a transcript need every attendee's recording consent", async () => {
    const ai = docAi(fakeModel());
    const m = value(await meetings.create(designer(), { title: "Sync", kind: "internal", meetingDate: "2026-10-21", attendees: [ids.designer, ids.strategist] }));
    const transcript = "Nikhil: we will post the reel on Friday. Anjali: fine.";
    const r = await ai.notesFromTranscript(designer(), { meetingId: m.id, transcript });
    expect(r.ok ? "" : r.error.message).toMatch(/Recording consent isn't on record for (Nikhil Das|Anjali Nair), (Nikhil Das|Anjali Nair)\./);
    for (const p of [ids.designer, ids.strategist]) await store.consent.add({ id: newId(), subjectType: "person", subjectId: p, purpose: "Meeting recording and transcript", method: "in_person", givenAt: new Date(), note: null, recordedById: ids.designer });
    expect(code(await ai.notesFromTranscript(designer(), { meetingId: m.id, transcript }))).toBe("ok");
  });
});
