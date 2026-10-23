// Moving off ClickUp (D38): clients and open tasks from a CSV export; a second run adds nothing.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { readClickUpCsv } from "@/lib/clickup";
import { createImportService } from "@/services/import";
import { actorOf, addClient, addPerson, testDb, testStore, fixedClock, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const importer = createImportService({ store, clock: fixedClock("2026-10-14") });
const ids = {} as Record<"owner" | "anjali" | "vishnu" | "medcrest", string>;
const owner = () => actorOf(ids.owner, ["owner"]);

const CSV = [
  "Task ID,Task Name,Task Content,Status,Due Date,Start Date,Parent ID,Assignees,Priority,Space Name,Folder Name,List Name,Time Estimated",
  "a1,Plan November campaign,,in progress,2026-10-20,,,[Anjali Nair],high,Clients,Zenith IAS,November,7200000",
  "a2,Write ad copy,,to do,2026-10-22,,a1,[Vishnu],,Clients,Zenith IAS,November,",
  "a3,October report,,complete,2026-10-01,,,[Anjali Nair],,Clients,Zenith IAS,October,",
  "b1,Fix landing page form,,client review,2026-10-18,,,[Vishnu Prasad],urgent,Clients,Medcrest NEET Coaching,Website,",
  "x1,Team offsite,,to do,,,,,,Internal,Oppllo,Admin,",
].join("\n");

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.anjali = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.vishnu = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.medcrest = await addClient(db, "Medcrest NEET Coaching");
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("previewing", () => {
  it("suggests clients, statuses and people from the export", async () => {
    const { tasks } = readClickUpCsv(CSV);
    const r = await importer.preview(owner(), tasks);
    if (!r.ok) throw new Error(r.error.message);
    const p = r.value;
    expect(p.defaults).toEqual({ clientFrom: "folder", projectFrom: "list" });
    expect(p.levels.folder.clients).toEqual([
      { name: "Zenith IAS", tasks: 3, suggestion: "new", existingName: null },
      { name: "Medcrest NEET Coaching", tasks: 1, suggestion: ids.medcrest, existingName: "Medcrest NEET Coaching" },
      { name: "Oppllo", tasks: 1, suggestion: "new", existingName: null },
    ]);
    expect(p.statuses.map((x) => [x.name, x.suggestion])).toEqual([
      ["to do", "todo"],
      ["client review", "in_review"],
      ["complete", "skip"],
      ["in progress", "in_progress"],
    ]);
    expect(Object.fromEntries(p.people.map((x) => [x.name, x.suggestion]))).toEqual({ "Anjali Nair": ids.anjali, Vishnu: ids.vishnu, "Vishnu Prasad": ids.vishnu });
  });

  it("is for the owner only", async () => {
    const r = await importer.preview(actorOf(ids.anjali, ["strategist"]), readClickUpCsv(CSV).tasks);
    expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
  });
});

describe("importing", () => {
  const mapping = () => ({
    clientFrom: "folder",
    projectFrom: "list",
    clients: { "Zenith IAS": "new", "Medcrest NEET Coaching": ids.medcrest, Oppllo: "skip" },
    statuses: {},
    people: { "Anjali Nair": ids.anjali, Vishnu: ids.vishnu, "Vishnu Prasad": ids.vishnu },
  });

  it("creates clients, projects, open tasks and subtasks; closed work stays behind", async () => {
    const r = await importer.run(owner(), { tasks: readClickUpCsv(CSV).tasks, mapping: mapping() });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value).toEqual({ clients: 1, projects: 2, tasks: 2, subtasks: 1, alreadyImported: 0, closed: 1, leftOut: 1 });

    const rows = await db
      .select({ title: s.tasks.title, status: s.tasks.status, ownerId: s.tasks.ownerId, parent: s.tasks.parentTaskId, client: s.clients.name, project: s.projects.name, estimate: s.tasks.estimateMinutes, external: s.tasks.externalId })
      .from(s.tasks)
      .innerJoin(s.clients, sql`${s.clients.id} = ${s.tasks.clientId}`)
      .innerJoin(s.projects, sql`${s.projects.id} = ${s.tasks.projectId}`)
      .orderBy(s.tasks.externalId);
    expect(rows.map((t) => [t.external, t.title, t.status, t.client, t.project, t.parent !== null])).toEqual([
      ["clickup:a1", "Plan November campaign", "in_progress", "Zenith IAS", "November", false],
      ["clickup:a2", "Write ad copy", "todo", "Zenith IAS", "November", true],
      ["clickup:b1", "Fix landing page form", "in_review", "Medcrest NEET Coaching", "Website", false],
    ]);
    expect(rows[0]).toMatchObject({ ownerId: ids.anjali, estimate: 120 });
    // Owners joined the client teams.
    const team = await db.select({ personId: s.clientMembers.personId }).from(s.clientMembers).innerJoin(s.clients, sql`${s.clients.id} = ${s.clientMembers.clientId}`).where(sql`${s.clients.name} = 'Zenith IAS'`);
    expect(team.map((m) => m.personId).sort()).toEqual([ids.anjali, ids.vishnu].sort());
  });

  it("running it again adds nothing", async () => {
    const tasks = readClickUpCsv(CSV).tasks;
    await importer.run(owner(), { tasks, mapping: mapping() });
    const again = await importer.run(owner(), { tasks, mapping: mapping() });
    expect(again.ok && again.value).toEqual({ clients: 0, projects: 0, tasks: 0, subtasks: 0, alreadyImported: 3, closed: 1, leftOut: 1 });
    expect(await db.select({ id: s.tasks.id }).from(s.tasks)).toHaveLength(3);
    expect(await db.select({ id: s.clients.id }).from(s.clients)).toHaveLength(2);
  });

  it("puts a later subtask under its earlier-imported parent, in the parent's client, even if the mapping changed", async () => {
    const first = readClickUpCsv(CSV).tasks.filter((t) => t.ref === "a1");
    await importer.run(owner(), { tasks: first, mapping: mapping() });
    // Second export: the subtask alone, now under a different list and with folders read as clients differently.
    const second = readClickUpCsv(CSV).tasks.filter((t) => t.ref === "a2").map((t) => ({ ...t, folder: "Somewhere else", list: "Elsewhere" }));
    const r = await importer.run(owner(), { tasks: second, mapping: { ...mapping(), clients: { "Somewhere else": "new" } } });
    expect(r.ok && r.value).toMatchObject({ clients: 0, projects: 0, subtasks: 1 });
    const [parent, child] = await db.select({ id: s.tasks.id, parent: s.tasks.parentTaskId, project: s.tasks.projectId, client: s.tasks.clientId }).from(s.tasks).orderBy(s.tasks.externalId);
    expect(child).toMatchObject({ parent: parent!.id, project: parent!.project, client: parent!.client });
  });

  it("makes repeated rows unique instead of failing, and a double click imports once", async () => {
    const csv = ["Task Name,Status,Folder Name,List Name", "Monthly report,to do,Zenith IAS,Reports", "Monthly report,to do,Zenith IAS,Reports"].join("\n");
    const tasks = readClickUpCsv(csv).tasks;
    expect(tasks.map((t) => t.ref)).toEqual(["Reports/Monthly report", "Reports/Monthly report#2"]);
    const [a, b] = await Promise.all([importer.run(owner(), { tasks, mapping: mapping() }), importer.run(owner(), { tasks, mapping: mapping() })]);
    expect(a.ok && b.ok).toBe(true);
    expect(await db.select({ id: s.tasks.id }).from(s.tasks)).toHaveLength(2);
  });

  it("refuses a bad mapping", async () => {
    for (const bad of [{ statuses: { "to do": "maybe" } }, { statuses: { "to do": "done" } }, { projectFrom: "folder" }]) {
      const r = await importer.run(owner(), { tasks: readClickUpCsv(CSV).tasks, mapping: { ...mapping(), ...bad } });
      expect(r.ok ? "ok" : r.error.code).toBe("invalid");
    }
  });
});
