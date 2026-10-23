// The access register and joining/exit checklists (HR slice 2, D77).
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { createAccessService } from "@/services/access";
import { createPeopleService } from "@/services/people";
import { actorOf, addClient, addPerson, addProjectWithTask, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const access = createAccessService({ store, clock });
const people = createPeopleService({ store, clock });
const ids = {} as Record<"owner" | "hr" | "designer" | "editor" | "client", string>;
const hr = () => actorOf(ids.hr, ["hr"]);

async function grant(extra: Record<string, string> = {}) {
  const r = await access.grant(hr(), { personId: ids.designer, system: "Meta Business Manager", account: "Zenith IAS ad account", clientId: ids.client, level: "Admin", grantedOn: "2026-09-01", ...extra });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.id;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.hr = await addPerson(db, "Divya Suresh", ["hr"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.editor = await addPerson(db, "Nikhil Thomas", ["video_editor"]);
  ids.client = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
  await addProjectWithTask(db, ids.client, { ownerId: ids.designer, dueDate: "2026-10-20" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("the access register", () => {
  it("is kept by HR; a person sees their own, nobody else's", async () => {
    await grant();
    const mine = await access.forPerson(actorOf(ids.designer, ["designer"]), ids.designer);
    expect(mine.ok && mine.value.access.map((a) => [a.system, a.clientName, a.revokedOn])).toEqual([["Meta Business Manager", "Zenith IAS Academy", null]]);
    expect(mine.ok && mine.value.canManage).toBe(false);
    const peek = await access.forPerson(actorOf(ids.editor, ["video_editor"]), ids.designer);
    expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
    const designerGrant = await access.grant(actorOf(ids.designer, ["designer"]), { personId: ids.designer, system: "Canva", grantedOn: "2026-10-01" });
    expect(designerGrant.ok ? "ok" : designerGrant.error.code).toBe("forbidden");
  });
});

describe("the exit checklist", () => {
  it("lists every open access, client and task, and ticking an access revokes it (and unticking restores it)", async () => {
    const meta = await grant();
    await grant({ system: "Canva", account: "", clientId: "", level: "" });
    const started = await access.startChecklist(hr(), { personId: ids.designer, kind: "exit" });
    expect(started.ok).toBe(true);
    const view = await access.forPerson(hr(), ids.designer);
    if (!view.ok) throw new Error(view.error.message);
    const titles = view.value.checklists.exit.map((i) => i.title);
    expect(titles.slice(0, 4)).toEqual([
      "Remove access: Canva",
      "Remove access: Meta Business Manager — Zenith IAS ad account (Admin)",
      "Hand over Zenith IAS Academy to someone on its team",
      "Reassign 1 open task",
    ]);
    const metaItem = view.value.checklists.exit.find((i) => i.source === `access:${meta}`)!;
    expect((await access.setDone(hr(), { itemId: metaItem.id, done: "true" })).ok).toBe(true);
    expect((await store.access.findGrant(meta))!.revokedOn).toBe("2026-10-14");
    expect((await access.setDone(hr(), { itemId: metaItem.id, done: "false" })).ok).toBe(true);
    expect((await store.access.findGrant(meta))!.revokedOn).toBeNull();
    const twice = await access.startChecklist(hr(), { personId: ids.designer, kind: "exit" });
    expect(!twice.ok && twice.error.code).toBe("conflict");
  });

  it("revoking in the register ticks the matching exit step", async () => {
    const meta = await grant();
    await access.startChecklist(hr(), { personId: ids.designer, kind: "exit" });
    expect((await access.revoke(hr(), { grantId: meta })).ok).toBe(true);
    const items = await store.access.listItems(ids.designer);
    expect(items.find((i) => i.source === `access:${meta}`)!.doneAt).not.toBeNull();
  });

  it("starts by itself when the exit is recorded", async () => {
    await grant();
    expect((await people.markLeft(hr(), { personId: ids.designer, endDate: "2026-10-14" })).ok).toBe(true);
    const items = await store.access.listItems(ids.designer);
    expect(items.filter((i) => i.kind === "exit")[0]!.title).toMatch(/^Remove access: Meta Business Manager/);
  });
});

describe("the joining checklist", () => {
  it("starts with the person, from HR's template", async () => {
    expect((await access.setTemplate(hr(), { kind: "joining", items: "Laptop\n\nEmail account\nLaptop" })).ok).toBe(true);
    const r = await people.create(hr(), {
      fullName: "Sneha Joy",
      workEmail: "sneha@oppllo.example",
      jobTitle: "Social Media Intern",
      employmentType: "intern",
      workLocation: "office",
      capacityHoursPerWeek: "15",
      joinDate: "2026-10-14",
      roles: ["intern"],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const items = await store.access.listItems(r.value.id);
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ["joining", "Laptop"],
      ["joining", "Email account"],
    ]);
    const events = await db.select({ action: s.events.action }).from(s.events).where(sql`${s.events.entityId} = ${r.value.id}`);
    expect(events.map((e) => e.action).sort()).toEqual(["checklist.started", "person.created"]);
  });
});
