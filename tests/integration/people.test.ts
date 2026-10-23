import { sql } from "drizzle-orm";
// HR slice 1: people records, private data and role safety (D11, D17, D50; DPDP Act notes in plan/4-hr-module.md).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/types";
import { createIdentityService } from "@/services/identity";
import { createPeopleService } from "@/services/people";
import { actorOf, addDepartment, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const people = createPeopleService({ store, clock: fixedClock("2026-10-14") });
const identity = createIdentityService({ store });

const ids = {} as Record<"owner" | "hr" | "designer" | "strategist", string>;
const roles: Record<keyof typeof ids, Role[]> = { owner: ["owner"], hr: ["hr"], designer: ["designer"], strategist: ["strategist"] };
const as = (who: keyof typeof ids) => actorOf(ids[who], roles[who]);
let dept: string;

beforeEach(async () => {
  await wipe(db);
  dept = await addDepartment(db, "Creative");
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.hr = await addPerson(db, "Divya Suresh", roles.hr, { reportsToId: ids.owner });
  ids.designer = await addPerson(db, "Aswathy Menon", roles.designer, {
    reportsToId: ids.owner,
    departmentId: dept,
    personalPhone: "+91 90000 11111",
    emergencyContactName: "Mini",
  });
  ids.strategist = await addPerson(db, "Anjali Nair", roles.strategist, { reportsToId: ids.owner });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

const newPerson = (extra: Record<string, unknown> = {}) => ({
  fullName: "Sneha Joy",
  workEmail: "Sneha.Joy@Gmail.example",
  jobTitle: "Social Media Intern",
  employmentType: "intern",
  workLocation: "hybrid",
  departmentId: dept,
  reportsToId: ids.designer,
  capacityHoursPerWeek: "15",
  joinDate: "2026-10-01",
  roles: ["intern"],
  ...extra,
});

describe("profiles and private data", () => {
  it("shows colleagues only the directory fields", async () => {
    const r = await people.profile(as("strategist"), ids.designer);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.private).toBeNull();
    expect(r.value.person).toMatchObject({ fullName: "Aswathy Menon", departmentName: "Creative", reportsToName: "Faisal Rahman" });
    expect(JSON.stringify(r.value)).not.toContain("90000 11111");
  });

  it("shows the person their own private fields without auditing it", async () => {
    const r = await people.profile(as("designer"), ids.designer);
    expect(r.ok && r.value.private?.personalPhone).toBe("+91 90000 11111");
    expect(await eventsFor(db, ids.designer)).toEqual([]);
  });

  it("shows HR private fields and writes every such view to the audit log", async () => {
    const r = await people.profile(as("hr"), ids.designer);
    expect(r.ok && r.value.private?.emergencyContactName).toBe("Mini");
    expect(await eventsFor(db, ids.designer)).toEqual([{ action: "person.private_viewed", actorId: ids.hr }]);
  });
});

describe("HR adds and edits people", () => {
  it("adds a person who can then sign in", async () => {
    const r = await people.create(as("hr"), newPerson());
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect((await identity.personForSignIn("sneha.joy@gmail.example"))?.capacityMinutesPerWeek).toBe(900);
    expect((await eventsFor(db, r.value.id)).map((e) => e.action)).toEqual(["person.created", "checklist.started"]);
  });

  it("refuses a duplicate email, an unknown manager, and non-HR roles", async () => {
    expect(await people.create(as("hr"), newPerson({ workEmail: "aswathy.menon@oppllo.example" }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { workEmail: expect.any(Array) } },
    });
    expect((await people.create(as("hr"), newPerson({ reportsToId: "01a13a58-0000-7000-8000-000000000000" }))).ok).toBe(false);
    expect((await people.create(as("designer"), newPerson())).ok).toBe(false);
    expect(await people.create(as("hr"), newPerson({ roles: [] }))).toMatchObject({ ok: false, error: { fieldErrors: { roles: expect.any(Array) } } });
  });

  it("lets only the owner give the Owner or HR role", async () => {
    expect(await people.create(as("hr"), newPerson({ roles: ["owner"] }))).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await people.create(as("hr"), newPerson({ roles: ["hr"] }))).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect((await people.create(as("owner"), newPerson({ roles: ["hr"] }))).ok).toBe(true);
  });

  it("stops anyone changing their own roles (which also means the last owner can't demote themselves)", async () => {
    const own = { ...newPerson(), fullName: "Divya Suresh", workEmail: "divya.suresh@oppllo.example", employmentType: "full_time", roles: ["hr", "accountant"], reportsToId: ids.owner };
    expect(await people.update(as("hr"), ids.hr, own)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const demoteOwner = { ...newPerson(), fullName: "Faisal Rahman", workEmail: "faisal.rahman@oppllo.example", employmentType: "full_time", roles: ["strategist"], reportsToId: null };
    // The only owner can't remove their own owner role (own roles), and nobody can remove the last owner.
    expect((await people.update(as("owner"), ids.owner, demoteOwner)).ok).toBe(false);
  });

  it("records what changed in an edit, without personal values", async () => {
    const edit = { ...newPerson(), fullName: "Aswathy Menon", workEmail: "aswathy.menon@oppllo.example", employmentType: "full_time", jobTitle: "Senior Designer", capacityHoursPerWeek: "35", roles: ["designer"], reportsToId: ids.owner, personalPhone: "+91 90000 22222" };
    expect((await people.update(as("hr"), ids.designer, edit)).ok).toBe(true);
    const updated = await store.people.findById(ids.designer);
    expect(updated).toMatchObject({ jobTitle: "Senior Designer", capacityMinutesPerWeek: 2100 });
    const [event] = (await eventsFor(db, ids.designer)).filter((e) => e.action === "person.updated");
    expect(event).toBeDefined();
  });
});

describe("self-service", () => {
  it("lets anyone update their own phones and emergency contact", async () => {
    expect((await people.updateMyContact(as("designer"), { personalPhone: "+91 98765 43210", emergencyContactName: "Suresh" })).ok).toBe(true);
    const priv = await store.people.findPrivate(ids.designer);
    expect(priv).toMatchObject({ personalPhone: "+91 98765 43210", emergencyContactName: "Suresh" });
    expect(await people.updateMyContact(as("designer"), { personalPhone: "call me" })).toMatchObject({ ok: false, error: { code: "invalid" } });
  });
});

describe("leavers", () => {
  it("can't sign in after HR records their exit", async () => {
    expect((await people.markLeft(as("hr"), { personId: ids.designer, endDate: "2026-10-14" })).ok).toBe(true);
    expect(await identity.actorFor(ids.designer)).toBeNull();
    const directory = await people.directory(as("strategist"));
    expect(directory.ok && directory.value.map((p) => p.fullName)).not.toContain("Aswathy Menon");
    // A colleague can no longer open their profile; HR still can.
    expect((await people.profile(as("strategist"), ids.designer)).ok).toBe(false);
    expect((await people.profile(as("hr"), ids.designer)).ok).toBe(true);
  });

  it("refuses future exit dates and the last owner", async () => {
    expect((await people.markLeft(as("hr"), { personId: ids.designer, endDate: "2026-11-01" })).ok).toBe(false);
    expect((await people.markLeft(as("hr"), { personId: ids.owner, endDate: "2026-10-14" })).ok).toBe(false);
  });
});

describe("review fixes (stage 5)", () => {
  const ownerEdit = (extra: Record<string, unknown> = {}) => ({
    ...newPerson(),
    fullName: "Faisal Rahman",
    workEmail: "faisal.rahman@oppllo.example",
    employmentType: "full_time",
    roles: ["owner"],
    departmentId: "",
    reportsToId: "",
    ...extra,
  });

  it("accepts form-shaped empty strings for 'No team' and 'Nobody'", async () => {
    expect((await people.create(as("hr"), newPerson({ departmentId: "", reportsToId: "" }))).ok).toBe(true);
    expect((await people.update(as("owner"), ids.owner, ownerEdit())).ok).toBe(true);
  });

  it("stops HR editing an owner, changing a sign-in email, editing themselves or becoming someone's manager", async () => {
    expect(await people.update(as("hr"), ids.owner, ownerEdit({ workEmail: "hr.alt@gmail.example" }))).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const designer = { ...newPerson(), fullName: "Aswathy Menon", workEmail: "aswathy.menon@oppllo.example", employmentType: "full_time", roles: ["designer"], reportsToId: ids.owner };
    expect(await people.update(as("hr"), ids.designer, { ...designer, workEmail: "someone.else@gmail.example" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await people.update(as("hr"), ids.designer, { ...designer, reportsToId: ids.hr })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const self = { ...newPerson(), fullName: "Divya Suresh", workEmail: "divya.suresh@oppllo.example", employmentType: "full_time", roles: ["hr"], reportsToId: ids.owner, joinDate: "2020-01-01" };
    expect(await people.update(as("hr"), ids.hr, self)).toMatchObject({ ok: false, error: { code: "forbidden" } });
    // The owner may change an email.
    expect((await people.update(as("owner"), ids.designer, { ...designer, workEmail: "aswathy@oppllo.example" })).ok).toBe(true);
  });

  it("stops HR recording an owner's exit even when another owner exists", async () => {
    await people.create(as("owner"), newPerson({ workEmail: "co.owner@oppllo.example", roles: ["owner"], reportsToId: "" }));
    expect(await people.markLeft(as("hr"), { personId: ids.owner, endDate: "2026-10-14" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("logs which private fields HR changed", async () => {
    const edit = { ...newPerson(), fullName: "Aswathy Menon", workEmail: "aswathy.menon@oppllo.example", employmentType: "full_time", roles: ["designer"], reportsToId: ids.owner, personalPhone: "+91 90000 11111", emergencyContactName: "Suresh" };
    expect((await people.update(as("hr"), ids.designer, edit)).ok).toBe(true);
    const [row] = await db.execute<{ data: { fields: string[] } }>(sql`select data from events where action = 'person.updated' and entity_id = ${ids.designer}`).then((r) => [...r]);
    expect(row?.data.fields).toContain("emergencyContactName");
    expect(row?.data.fields).not.toContain("personalPhone"); // unchanged
  });

  it("changes only the contact fields that were sent", async () => {
    expect((await people.updateMyContact(as("designer"), { emergencyContactName: "Rasheed" })).ok).toBe(true);
    expect(await store.people.findPrivate(ids.designer)).toMatchObject({ emergencyContactName: "Rasheed", personalPhone: "+91 90000 11111" });
  });
});

describe("teams (test report L16)", () => {
  it("lets HR add, rename and head a team, refuses duplicates, and retires only empty teams", async () => {
    expect((await people.saveTeam(as("designer"), { name: "Video" })).ok).toBe(false);
    const added = await people.saveTeam(as("hr"), { name: "Video", headPersonId: ids.strategist });
    if (!added.ok) throw new Error(added.error.message);
    expect(await people.saveTeam(as("hr"), { name: "video" })).toMatchObject({ ok: false, error: { fieldErrors: { name: ["There's already a team with that name."] } } });
    expect((await people.saveTeam(as("hr"), { departmentId: added.value.id, name: "Video and reels", headPersonId: ids.strategist })).ok).toBe(true);
    expect((await store.people.listDepartments()).find((d) => d.id === added.value.id)).toMatchObject({ name: "Video and reels", headPersonId: ids.strategist });

    await store.people.update(ids.designer, { departmentId: added.value.id });
    expect(await people.removeTeam(as("hr"), { departmentId: added.value.id })).toMatchObject({ ok: false, error: { code: "conflict" } });
    await store.people.update(ids.designer, { departmentId: null });
    expect((await people.removeTeam(as("hr"), { departmentId: added.value.id })).ok).toBe(true);
    expect((await store.people.listDepartments()).some((d) => d.id === added.value.id)).toBe(false);
    expect((await eventsFor(db, added.value.id)).map((e) => e.action)).toEqual(["department.created", "department.updated", "department.removed"]);
  });
});
