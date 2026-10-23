// HR slice 3: intern engine, one-to-ones, letters, payroll export, training library.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Role } from "@/lib/types";
import { createAttendanceService } from "@/services/attendance";
import { createDocService } from "@/services/docs";
import { createTalentService } from "@/services/talent";
import { actorOf, addClient, addLeaveSetup, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const clock = fixedClock("2026-10-14");
const talent = createTalentService({ store, clock });
const attendance = createAttendanceService({ store, clock });
const docs = createDocService({ store, clock });

type Who = "hr" | "owner" | "designer" | "intern" | "editor";
const ids = {} as Record<Who | "dept", string>;
const roles: Record<Who, Role[]> = { hr: ["hr"], owner: ["owner"], designer: ["designer"], intern: ["intern"], editor: ["video_editor"] };
const as = (who: Who) => actorOf(ids[who], roles[who]);
const must = <T,>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

beforeEach(async () => {
  await wipe(db);
  await db.execute(sql`truncate table intern_records, one_to_ones, letters, doc_versions, docs cascade`);
  ids.dept = newId();
  await db.insert(s.departments).values({ id: ids.dept, name: "Design" });
  ids.hr = await addPerson(db, "Divya Suresh", roles.hr);
  ids.owner = await addPerson(db, "Faisal Rahman", roles.owner);
  ids.designer = await addPerson(db, "Vishnu Prasad", roles.designer, { departmentId: ids.dept });
  ids.editor = await addPerson(db, "Nikhil Thomas", roles.editor);
  ids.intern = await addPerson(db, "Hiba Nasrin", roles.intern, { departmentId: ids.dept, joinDate: "2026-07-01", reportsToId: ids.designer, jobTitle: "Design intern" });
});

afterAll(async () => {
  await store.close();
  await client.end();
});

describe("intern engine", () => {
  it("HR starts the record; the mentor sees the intern, their work, and reviews them", async () => {
    expect(await talent.saveRecord(as("designer"), { personId: ids.intern, batch: "Jul 2026" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
    must(await talent.saveRecord(as("hr"), { personId: ids.intern, batch: "Jul 2026", mentorId: ids.designer, plannedEndDate: "2026-12-31", focus: "Reels and posters" }));
    const zenith = await addClient(db, "Zenith IAS Academy", { members: [ids.designer] });
    const project = newId();
    await db.insert(s.projects).values({ id: project, clientId: zenith, name: "Oct" });
    await db.insert(s.tasks).values([
      { id: newId(), projectId: project, clientId: zenith, title: "Poster", rank: "a0", ownerId: ids.intern, status: "done", dueDate: "2026-10-10", completedAt: new Date("2026-10-09T05:00:00Z") },
      { id: newId(), projectId: project, clientId: zenith, title: "Reel", rank: "a1", ownerId: ids.intern, status: "done", dueDate: "2026-10-05", completedAt: new Date("2026-10-07T05:00:00Z") },
    ]);
    const mentorView = must(await talent.interns(as("designer")));
    expect(mentorView.current.map((v) => [v.person.fullName, v.record?.batch, v.daysLeft])).toEqual([["Hiba Nasrin", "Jul 2026", 78]]);
    expect(await talent.interns(as("editor"))).toMatchObject({ ok: false });
    const page = must(await talent.intern(as("designer"), ids.intern));
    expect(page.work).toMatchObject({ tasksDone: 2, withDue: 2, onTime: 1 });
    expect(page.canReview).toBe(true);
    expect(await talent.intern(as("editor"), ids.intern)).toMatchObject({ ok: false });

    must(await talent.review(as("designer"), { personId: ids.intern, strengths: "Fast, careful", workedOn: "Posters and reels for Zenith", hireAgain: "yes", inTalentPool: "on" }));
    await db.execute(sql`update people set status = 'left', end_date = '2026-10-10' where id = ${ids.intern}`);
    expect(must(await talent.talentPool(as("hr"))).map((v) => v.person.fullName)).toEqual(["Hiba Nasrin"]);
    expect((await eventsFor(db, ids.intern)).map((e) => e.action)).toEqual(["intern.started", "intern.reviewed"]);
  });

  it("issues letters from the record, frozen with a reference number, seen by HR and the person", async () => {
    must(await talent.saveRecord(as("hr"), { personId: ids.intern, batch: "Jul 2026", mentorId: ids.designer }));
    must(await talent.review(as("hr"), { personId: ids.intern, workedOn: "Posters for Zenith", hireAgain: "maybe" }));
    const draft = must(await talent.draftLetter(as("hr"), ids.intern, "internship_certificate"));
    expect(draft.body).toContain("Hiba Nasrin worked with Oppllo Digital as an intern in the Design team");
    expect(draft.body).toContain("Posters for Zenith");
    expect(draft.kind).toBe("internship_certificate");
    // With no kind asked for, someone still here gets an offer letter (test report L15).
    expect(must(await talent.draftLetter(as("hr"), ids.designer)).kind).toBe("offer");
    const a = must(await talent.issueLetter(as("hr"), { personId: ids.intern, kind: "internship_certificate" }));
    const b = must(await talent.issueLetter(as("hr"), { personId: ids.intern, kind: "experience", body: "Edited by HR." }));
    expect([a.refNo, b.refNo]).toEqual(["OPD/2026/001", "OPD/2026/002"]);
    // Issued at the same moment, they still get different numbers.
    const both = await Promise.all([talent.issueLetter(as("hr"), { personId: ids.intern, kind: "experience" }), talent.issueLetter(as("hr"), { personId: ids.intern, kind: "relieving" })]);
    expect(new Set(both.map((x) => must(x).refNo))).toEqual(new Set(["OPD/2026/003", "OPD/2026/004"]));
    // The mentor sees the intern, not their letters; the intern doesn't see the private verdict.
    expect(must(await talent.intern(as("designer"), ids.intern)).letters).toEqual([]);
    expect(must(await talent.intern(as("intern"), ids.intern)).record).toMatchObject({ hireAgain: null, reviewNotes: null });
    expect(must(await talent.letter(as("intern"), b.id)).body).toBe("Edited by HR.");
    expect(await talent.letter(as("designer"), b.id)).toMatchObject({ ok: false });
    expect(await talent.issueLetter(as("designer"), { personId: ids.intern, kind: "offer" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("one-to-ones", () => {
  it("the lead and HR note them; the person reads theirs; nobody else does", async () => {
    must(await talent.addOneToOne(as("designer"), { personId: ids.intern, meetingDate: "2026-10-01", discussed: "Reel pacing", agreed: "Watch 3 references" }));
    expect(await talent.addOneToOne(as("editor"), { personId: ids.intern, meetingDate: "2026-10-01", discussed: "x x" })).toMatchObject({ ok: false });
    expect(await talent.addOneToOne(as("designer"), { personId: ids.intern, meetingDate: "2026-10-20", discussed: "Future" })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(must(await talent.oneToOnes(as("intern"), ids.intern))).toMatchObject({ canAdd: false, lastDays: 13, items: [{ discussed: "Reel pacing", leadName: "Vishnu Prasad" }] });
    expect(await talent.oneToOnes(as("editor"), ids.intern)).toMatchObject({ ok: false });
    await db.execute(sql`update people set reports_to_id = ${ids.owner} where id = ${ids.designer}`);
    expect(must(await talent.overdueOneToOnes(as("hr"))).map((r) => r.fullName)).toEqual(["Vishnu Prasad"]);
  });
});

describe("payroll export", () => {
  it("lists working days, presence, paid and unpaid leave, and loss-of-pay days per person", async () => {
    const types = await addLeaveSetup(db);
    await db.insert(s.leaveRequests).values([
      { id: newId(), personId: ids.designer, leaveTypeId: types.casual, startDate: "2026-10-05", endDate: "2026-10-06", status: "approved" },
      { id: newId(), personId: ids.designer, leaveTypeId: types.unpaid, startDate: "2026-10-07", endDate: "2026-10-07", status: "approved" },
    ]);
    const r = must(await attendance.payroll(as("hr"), "2026-10"));
    const lines = r.csv.replace("﻿", "").trim().split("\n");
    expect(lines[0]).toBe("Name,Work email,Department,Type,Working days,Days present,Paid leave,Unpaid leave,Absent,Loss of pay days,Late arrivals");
    const designer = lines.find((l) => l.startsWith("Vishnu Prasad"))!.split(",");
    expect(designer.slice(6, 8)).toEqual(["2", "1"]);
    expect(Number(designer[9])).toBe(1 + Number(designer[8]));
    expect(await attendance.payroll(as("designer"), "2026-10")).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});

describe("training library", () => {
  it("marks team pages as training for a department or everyone", async () => {
    const general = must(await docs.create(as("hr"), { title: "How Oppllo works" })).id;
    const design = must(await docs.create(as("hr"), { title: "Poster basics" })).id;
    const other = must(await docs.create(as("hr"), { title: "Editing basics" })).id;
    must(await docs.setTraining(as("hr"), { docId: general, training: "on" }));
    must(await docs.setTraining(as("hr"), { docId: design, training: "on", departmentId: ids.dept }));
    expect(await docs.setTraining(as("hr"), { docId: other, training: "on", departmentId: newId() })).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect((await docs.training(as("intern"), ids.dept)).map((d) => d.title)).toEqual(["How Oppllo works", "Poster basics"]);
    expect(await docs.setTraining(as("intern"), { docId: general, training: "" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});
