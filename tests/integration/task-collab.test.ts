// Stage 9b.2: more assignees and watchers, @mentions, checklists and files on tasks.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createTaskCollabService } from "@/services/task-collab";
import { createTaskService } from "@/services/tasks";
import { actorOf, addClient, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, {
  signLink: ({ fileId }, expiresAt, name, viewerId) => `/api/files/${fileId}?exp=${expiresAt.getTime()}&name=${name}&viewer=${viewerId}`,
});
const clock = fixedClock("2026-10-14");
const tasks = createTaskService({ store, clock });
const collab = createTaskCollabService({ store, clock, storage });

type Who = "owner" | "strategist" | "designer" | "editor" | "intern";
const ids = {} as Record<Who | "zenith" | "project" | "task", string>;
const roles: Record<Who, Role[]> = { owner: ["owner"], strategist: ["strategist"], designer: ["designer"], editor: ["video_editor"], intern: ["intern"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
const notes = async (who: Who) => (await store.notifications.list(ids[who], 20)).map((n) => n.title);
const seesTask = async (who: Who) => (await tasks.get(as(who), ids.task)).ok;

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer);
  ids.editor = await addPerson(db, "Nikhil Thomas", roles.editor);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.strategist, ids.designer] });
  ids.project = newId();
  await db.insert(s.projects).values({ id: ids.project, clientId: ids.zenith, name: "Meta ads · Oct" });
  ids.task = newId();
  await db.insert(s.tasks).values({ id: ids.task, projectId: ids.project, clientId: ids.zenith, title: "Reel for Diwali", rank: "a0", ownerId: ids.designer, createdById: ids.strategist, dueDate: "2026-10-14" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("more people on a task", () => {
  it("lets an extra assignee see it on My Day, change it, and notifies them", async () => {
    expect(await seesTask("intern")).toBe(false);
    expect(await collab.addPerson(as("designer"), { taskId: ids.task, personId: ids.intern, role: "assignee" })).toEqual({ ok: true, value: null });
    expect(await seesTask("intern")).toBe(true);
    const day = await tasks.myDay(as("intern"));
    expect(day.ok && day.value.dueToday.map((t) => t.title)).toEqual(["Reel for Diwali"]);
    expect(day.ok && day.value.dueToday[0]).toMatchObject({ canEdit: true, assignees: [{ id: ids.intern, name: "Hiba Nasrin" }] });
    expect(await notes("intern")).toEqual(["Vishnu Prasad added you to Reel for Diwali"]);
    const list = await tasks.table(as("owner"), { owner: ids.intern });
    expect(list.ok && list.value.tasks.map((t) => t.title)).toEqual(["Reel for Diwali"]);
    // Adding again, or adding the owner, changes nothing.
    await collab.addPerson(as("designer"), { taskId: ids.task, personId: ids.intern, role: "assignee" });
    await collab.addPerson(as("designer"), { taskId: ids.task, personId: ids.designer, role: "assignee" });
    expect((await eventsFor(db, ids.task)).map((e) => e.action)).toEqual(["task.person_added"]);
    expect(await collab.removePerson(as("designer"), { taskId: ids.task, personId: ids.intern, role: "assignee" })).toEqual({ ok: true, value: null });
    expect(await seesTask("intern")).toBe(false);
  });

  it("lets anyone who sees a task watch it, but only its editors add others", async () => {
    await db.insert(s.clientMembers).values({ clientId: ids.zenith, personId: ids.editor });
    expect(await collab.addPerson(as("editor"), { taskId: ids.task, personId: ids.intern, role: "watcher" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await collab.addPerson(as("editor"), { taskId: ids.task, personId: ids.editor, role: "watcher" })).toEqual({ ok: true, value: null });
    expect(await collab.addPerson(as("intern"), { taskId: ids.task, personId: ids.intern, role: "watcher" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    const team = await collab.forTask(as("editor"), ids.task);
    expect(team.ok && team.value).toMatchObject({ watching: true, canEdit: false, assignees: [{ id: ids.designer, isOwner: true }], watchers: [{ id: ids.editor }] });
    // Watchers hear about status changes; the person who acted never does.
    await tasks.move(as("designer"), { taskId: ids.task, status: "in_review" });
    expect(await notes("editor")).toEqual(["Reel for Diwali is ready for review"]);
    expect(await collab.removePerson(as("editor"), { taskId: ids.task, personId: ids.editor, role: "watcher" })).toEqual({ ok: true, value: null });
    // The history says "started/stopped watching", not "took X off the task" (QA S2-B1).
    await collab.addPerson(as("designer"), { taskId: ids.task, personId: ids.editor, role: "watcher" });
    await collab.removePerson(as("designer"), { taskId: ids.task, personId: ids.editor, role: "watcher" });
    const history = await tasks.activity(as("designer"), ids.task, { day: (d) => d });
    expect(history.ok && history.value.slice(0, 5).map((a) => `${a.who} ${a.text}`)).toEqual([
      "Vishnu Prasad stopped Nikhil Thomas watching",
      "Vishnu Prasad added Nikhil Thomas as a watcher",
      "Nikhil Thomas stopped watching",
      "Vishnu Prasad moved it from To do to In review",
      "Nikhil Thomas started watching",
    ]);
  });
});

describe("comments and @mentions", () => {
  it("notifies the mentioned (who then watch it) and everyone else on the task, never the author", async () => {
    await collab.addPerson(as("designer"), { taskId: ids.task, personId: ids.editor, role: "watcher" });
    const r = await tasks.comment(as("strategist"), { taskId: ids.task, body: "@Hiba Nasrin please add captions. @Anjali Nair noted" });
    expect(r.ok).toBe(true);
    expect(await notes("intern")).toEqual(["Anjali Nair mentioned you on Reel for Diwali"]);
    expect(await notes("designer")).toEqual(["Anjali Nair commented on Reel for Diwali"]);
    expect(await notes("editor")).toEqual(["Anjali Nair commented on Reel for Diwali", "Vishnu Prasad asked you to watch Reel for Diwali"]);
    expect(await notes("strategist")).toEqual([]);
    expect(await seesTask("intern")).toBe(true);
    const team = await collab.forTask(as("intern"), ids.task);
    expect(team.ok && team.value.watchers.map((w) => w.name)).toEqual(["Nikhil Thomas", "Hiba Nasrin"]);
  });
});

describe("checklists", () => {
  it("adds pasted lines in order, ticks, renames, moves and removes, recording each", async () => {
    expect(await collab.addChecklist(as("designer"), { taskId: ids.task, text: "- Script\n- Shoot\n\n[ ] Edit" })).toEqual({ ok: true, value: { added: 3 } });
    const steps = async () => {
      const t = await collab.forTask(as("designer"), ids.task);
      if (!t.ok) throw new Error(t.error.message);
      return t.value.checklist;
    };
    expect((await steps()).map((c) => c.text)).toEqual(["Script", "Shoot", "Edit"]);
    const [script, , edit] = await steps();
    expect((await collab.changeChecklist(as("designer"), { itemId: script!.id, action: "check" })).ok).toBe(true);
    expect((await collab.changeChecklist(as("designer"), { itemId: script!.id, action: "check" })).ok).toBe(true); // already ticked: nothing recorded
    expect((await collab.changeChecklist(as("designer"), { itemId: edit!.id, action: "up" })).ok).toBe(true);
    expect((await collab.changeChecklist(as("designer"), { itemId: edit!.id, action: "rename", text: "Edit  the reel" })).ok).toBe(true);
    expect((await steps()).map((c) => [c.text, c.done, c.doneByName])).toEqual([
      ["Script", true, "Vishnu Prasad"],
      ["Edit the reel", false, null],
      ["Shoot", false, null],
    ]);
    expect(await collab.changeChecklist(as("editor"), { itemId: script!.id, action: "uncheck" })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await collab.changeChecklist(as("designer"), { itemId: script!.id, action: "remove" })).ok).toBe(true);
    expect((await steps()).map((c) => c.text)).toEqual(["Edit the reel", "Shoot"]);
    const [row] = await db.select({ deletedAt: s.taskChecklistItems.deletedAt }).from(s.taskChecklistItems).where(sql`${s.taskChecklistItems.id} = ${script!.id}`);
    expect(row?.deletedAt).not.toBeNull();
    expect((await eventsFor(db, ids.task)).map((e) => e.action)).toEqual(["task.checklist_added", "task.checklist_checked", "task.checklist_moved", "task.checklist_renamed", "task.checklist_removed"]);
  });
});

describe("files and links", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("stores a real file under the task's client, links for the viewer only, and keeps it when removed", async () => {
    const r = await collab.addFile(as("designer"), { taskId: ids.task }, { name: "../ref board.png", bytes: png });
    if (!r.ok) throw new Error(r.error.message);
    const link = await collab.fileLink(as("strategist"), r.value.id);
    expect(link.ok && link.value.url).toMatch(new RegExp(`viewer=${ids.strategist}$`));
    expect(await collab.fileLink(as("intern"), r.value.id)).toMatchObject({ ok: false });
    const team = await collab.forTask(as("designer"), ids.task);
    expect(team.ok && team.value.files).toMatchObject([{ title: "ref board.png", contentType: "image/png", sizeBytes: 11, isLink: false, canRemove: true }]);
    await db.insert(s.clientMembers).values({ clientId: ids.zenith, personId: ids.editor });
    expect(await collab.removeFile(as("editor"), r.value.id)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await collab.removeFile(as("designer"), r.value.id)).toEqual({ ok: true, value: null });
    const [stored] = await db.select({ deletedAt: s.storedFiles.deletedAt }).from(s.storedFiles);
    expect(stored?.deletedAt).toBeNull();
  });

  it("attaches https links, refuses unknown files and lets only editors attach", async () => {
    const r = await collab.addFile(as("designer"), { taskId: ids.task, link: "https://drive.google.com/drive/folders/abc", title: "Raw footage" }, null);
    if (!r.ok) throw new Error(r.error.message);
    expect(await collab.fileLink(as("designer"), r.value.id)).toEqual({ ok: true, value: { url: "https://drive.google.com/drive/folders/abc" } });
    expect(await collab.addFile(as("designer"), { taskId: ids.task, link: "javascript:alert(1)" }, null)).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await collab.addFile(as("designer"), { taskId: ids.task }, { name: "app.exe", bytes: new Uint8Array([0x4d, 0x5a, 0, 0, 0xff]) })).toMatchObject({ ok: false, error: { code: "invalid" } });
    // A program whose bytes look like text is still refused by its name, and says why (test report M6).
    const text = new TextEncoder().encode("hello");
    expect(await collab.addFile(as("designer"), { taskId: ids.task }, { name: "setup.exe", bytes: text })).toMatchObject({ ok: false, error: { message: "Programs and scripts can't be attached." } });
    expect(await collab.addFile(as("designer"), { taskId: ids.task }, { name: "notes", bytes: new TextEncoder().encode("#!/bin/sh\nrm -rf /") })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect((await collab.addFile(as("designer"), { taskId: ids.task }, { name: "notes.txt", bytes: text })).ok).toBe(true);
    expect(await collab.addFile(as("designer"), { taskId: ids.task }, null)).toMatchObject({ ok: false, error: { code: "invalid" } });
    await db.insert(s.clientMembers).values({ clientId: ids.zenith, personId: ids.editor });
    expect(await collab.addFile(as("editor"), { taskId: ids.task, link: "https://example.com" }, null)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    const t = await collab.addFile(as("designer"), { taskId: ids.task }, { name: "page.html", bytes: html });
    if (!t.ok) throw new Error(t.error.message);
    const team = await collab.forTask(as("designer"), ids.task);
    expect(team.ok && team.value.files.find((f) => f.id === t.value.id)).toMatchObject({ title: "page.txt", contentType: "text/plain" });
  });
});
