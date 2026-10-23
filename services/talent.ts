// HR slice 3 (plan/4): the intern engine (batch, mentor, work record, end review, certificate, talent pool),
// one-to-one notes, and letters issued from a person's record.
// Who sees what: HR and the owner (people.write) everything; a mentor their mentees' intern record; a lead (the person
// they report to) the one-to-ones they held; every person their own record, one-to-ones and letters.
import { z } from "zod";
import { addDays, diffDays, istDate, type IsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { HIRE_AGAIN, LETTER_KINDS, type LetterKind } from "@/lib/types";
import { isoDate, optionalId, optionalText, parse } from "@/lib/validation/common";
import type { DataStore, InternRecordRow, LetterRow, OneToOneRow, PersonRecord } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { hiddenFor } from "./spaces";
import { DEFAULT_LETTERS, fillLetter, letterRef, missingFields, suggestLetterKind, type LetterField, type LetterTemplate } from "./rules/letters";

const HR_ONLY = "Only HR and the owner do this.";
const COMPANY = "Oppllo Digital";
const LETTER_SETTING = "letter_templates";
/** "No one-to-one in six weeks" (plan/5): the nudge HR sees. */
export const ONE_TO_ONE_GAP_DAYS = 42;

const recordSchema = z.object({
  personId: z.uuid(),
  batch: z.string().trim().min(2, { message: "Name the batch, e.g. Oct 2026." }).max(40),
  mentorId: optionalId,
  plannedEndDate: z.union([z.literal(""), isoDate]).optional().transform((v) => v || null),
  focus: optionalText(500),
});
const reviewSchema = z.object({
  personId: z.uuid(),
  strengths: optionalText(2000),
  workedOn: optionalText(2000),
  hireAgain: z.enum(HIRE_AGAIN, { message: "Would we take them on again?" }),
  reviewNotes: optionalText(2000),
  inTalentPool: z.union([z.literal("on"), z.literal(""), z.boolean()]).optional().transform((v) => v === "on" || v === true),
});
const oneToOneSchema = z.object({
  personId: z.uuid(),
  meetingDate: isoDate,
  discussed: z.string().trim().min(2, { message: "Write what you talked about." }).max(4000),
  agreed: optionalText(2000),
});
const letterSchema = z.object({ personId: z.uuid(), kind: z.enum(LETTER_KINDS), title: optionalText(150), body: optionalText(20_000) });
const templateSchema = z.object({ title: z.string().trim().min(2).max(150), body: z.string().trim().min(10).max(20_000) });
const templatesSchema = z.object({ offer: templateSchema, internship_certificate: templateSchema, experience: templateSchema, relieving: templateSchema });

export type WorkRecord = { tasksDone: number; onTime: number; withDue: number; hoursLogged: number; recent: Array<{ id: string; title: string; clientName: string; completedAt: Date | null }> };
export type InternView = {
  person: Pick<PersonRecord, "id" | "fullName" | "jobTitle" | "departmentId" | "departmentName" | "joinDate" | "endDate" | "status" | "reportsToName">;
  record: InternRecordRow | null;
  daysLeft: number | null;
};

export function createTalentService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;
  const hr = (actor: Actor) => can(actor, "people.write");

  /** What someone produced; `viewer` decides which task titles may be named (private spaces, Stage 14.1). */
  async function work(personId: string, from: IsoDate, to: IsoDate, viewer: Actor): Promise<WorkRecord> {
    const [done, time, hidden] = await Promise.all([
      store.tasks.list({ scope: { kind: "all" }, ownerId: personId, statuses: ["done"], anyLevel: true, sort: { by: "created", dir: "desc" }, limit: 2000 }),
      store.time.list({ personId, from, to }),
      hiddenFor(store, viewer),
    ]);
    // Calendar days in India, not UTC: finishing at 00:30 on the 6th is the 6th.
    const inRange = done.filter((t) => t.completedAt && istDate(t.completedAt) >= from);
    const withDue = inRange.filter((t) => t.dueDate);
    const onTime = withDue.filter((t) => istDate(t.completedAt!) <= t.dueDate!).length;
    return {
      tasksDone: inRange.length,
      onTime,
      withDue: withDue.length,
      hoursLogged: Math.round(time.reduce((n, e) => n + e.minutes, 0) / 6) / 10,
      recent: inRange.filter((t) => !hidden.has(t.clientId)).slice(0, 12).map((t) => ({ id: t.id, title: t.title, clientName: t.clientName, completedAt: t.completedAt })),
    };
  }

  async function templates(): Promise<Record<LetterKind, LetterTemplate>> {
    const saved = await store.calendar.getSetting<Record<string, LetterTemplate>>(LETTER_SETTING);
    return Object.fromEntries(LETTER_KINDS.map((k) => [k, saved?.[k] ?? DEFAULT_LETTERS[k]])) as Record<LetterKind, LetterTemplate>;
  }

  const service = {
    /** Interns now and before: HR sees all; mentors see their mentees. */
    async interns(actor: Actor): Promise<Result<{ current: InternView[]; past: InternView[]; canManage: boolean }>> {
      const today = clock.today();
      const [people, records] = await Promise.all([store.people.listAll(), store.talent.internRecords()]);
      const recordOf = new Map(records.map((r) => [r.personId, r]));
      const interns = people.filter((p) => p.employmentType === "intern" && (hr(actor) || recordOf.get(p.id)?.mentorId === actor.personId));
      if (!hr(actor) && !interns.length) return forbidden("Interns are looked after by HR and their mentors.");
      const view = (p: PersonRecord): InternView => {
        const record = recordOf.get(p.id) ?? null;
        const end = p.endDate ?? record?.plannedEndDate ?? null;
        return {
          person: { id: p.id, fullName: p.fullName, jobTitle: p.jobTitle, departmentId: p.departmentId, departmentName: p.departmentName, joinDate: p.joinDate, endDate: p.endDate, status: p.status, reportsToName: p.reportsToName },
          record,
          daysLeft: end && p.status === "active" ? diffDays(today, end) : null,
        };
      };
      const all = interns.map(view);
      return ok({
        current: all.filter((v) => v.person.status === "active").sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
        past: all.filter((v) => v.person.status !== "active").sort((a, b) => (b.person.endDate ?? "").localeCompare(a.person.endDate ?? "")),
        canManage: hr(actor),
      });
    },

    /** One intern's page: record, what they produced (from Projects), letters. */
    async intern(actor: Actor, personId: string): Promise<Result<InternView & { work: WorkRecord; letters: LetterRow[]; canManage: boolean; canReview: boolean }>> {
      if (!isId(personId)) return notFound("That person");
      const [p, record] = await Promise.all([store.people.findById(personId), store.talent.internRecord(personId)]);
      if (!p || p.employmentType !== "intern") return notFound("That intern");
      const mentor = record?.mentorId === actor.personId && (await store.people.findById(actor.personId))?.status === "active";
      const self = actor.personId === p.id;
      if (!hr(actor) && !mentor && !self) return notFound("That intern");
      const today = clock.today();
      const end = p.endDate ?? record?.plannedEndDate ?? null;
      // Letters are between HR and the person; the mentor doesn't see them.
      const [w, letters] = await Promise.all([work(p.id, p.joinDate, p.endDate ?? today, actor), hr(actor) || self ? store.talent.letters(p.id) : Promise.resolve([])]);
      return ok({
        person: { id: p.id, fullName: p.fullName, jobTitle: p.jobTitle, departmentId: p.departmentId, departmentName: p.departmentName, joinDate: p.joinDate, endDate: p.endDate, status: p.status, reportsToName: p.reportsToName },
        // The intern sees their record, not the private verdict (hire again, notes, talent pool).
        record: record && self && !hr(actor) ? { ...record, hireAgain: null, reviewNotes: null, inTalentPool: false } : record,
        daysLeft: end && p.status === "active" ? diffDays(today, end) : null,
        work: w,
        letters,
        canManage: hr(actor),
        canReview: hr(actor) || mentor,
      });
    },

    /** HR sets an intern's batch, mentor, planned end and focus. */
    async saveRecord(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      const parsed = parse(recordSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const p = await repos.people.findById(v.personId);
        if (!p || p.employmentType !== "intern") return notFound("That intern");
        if (v.mentorId) {
          const m = await repos.people.findById(v.mentorId);
          if (!m || m.status !== "active" || m.id === p.id) return invalid("Pick someone on the team as mentor.", { mentorId: ["Pick someone on the team as mentor."] });
        }
        if (v.plannedEndDate && v.plannedEndDate < p.joinDate) return invalid("The planned end is before they joined.", { plannedEndDate: ["Pick a date after they joined."] });
        const patch = { batch: v.batch, mentorId: v.mentorId ?? null, plannedEndDate: v.plannedEndDate, focus: v.focus };
        const before = await repos.talent.internRecord(p.id);
        if (before) await repos.talent.updateInternRecord(p.id, patch);
        else await repos.talent.createInternRecord({ id: newId(), personId: p.id, ...patch });
        return change(null, { actorId: actor.personId, action: before ? "intern.updated" : "intern.started", entityType: "intern_record", entityId: p.id, personId: p.id, data: { batch: v.batch, mentorId: v.mentorId ?? null } });
      });
    },

    /** The end review: HR or the mentor. Feeds the certificate and the talent pool. */
    async review(actor: Actor, raw: unknown): Promise<Result<null>> {
      const parsed = parse(reviewSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const record = await repos.talent.internRecord(v.personId);
        if (!record) return notFound("That intern's record (HR starts it first)");
        const activeMentor = record.mentorId === actor.personId && (await repos.people.findById(actor.personId))?.status === "active";
        if (!hr(actor) && !activeMentor) return forbidden("Only HR or the intern's mentor reviews them.");
        await repos.talent.updateInternRecord(v.personId, { strengths: v.strengths, workedOn: v.workedOn, hireAgain: v.hireAgain, reviewNotes: v.reviewNotes, inTalentPool: v.inTalentPool, reviewedById: actor.personId, reviewedAt: clock.now() });
        return change(null, { actorId: actor.personId, action: "intern.reviewed", entityType: "intern_record", entityId: v.personId, personId: v.personId, data: { hireAgain: v.hireAgain, talentPool: v.inTalentPool } });
      });
    },

    /** Past interns worth calling back: in the pool, or "yes" to hiring again. HR only. */
    async talentPool(actor: Actor): Promise<Result<InternView[]>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      const r = await service.interns(actor);
      if (!r.ok) return r;
      return ok(r.value.past.filter((v) => v.record?.inTalentPool || v.record?.hireAgain === "yes"));
    },

    // ---------- one-to-ones ----------

    /** A person's one-to-ones: theirs to read, their lead's (who they report to), and HR's. */
    async oneToOnes(actor: Actor, personId: string): Promise<Result<{ items: OneToOneRow[]; canAdd: boolean; lastDays: number | null }>> {
      if (!isId(personId)) return notFound("That person");
      const p = await store.people.findById(personId);
      if (!p) return notFound("That person");
      const lead = p.reportsToId === actor.personId;
      if (!hr(actor) && !lead && actor.personId !== p.id) return forbidden("One-to-ones are between a person, their lead and HR.");
      // A lead reads the notes they wrote; a new lead doesn't inherit the old lead's (HR and the person see all).
      const all = await store.talent.oneToOnes(p.id);
      const items = hr(actor) || actor.personId === p.id ? all : all.filter((o) => o.leadId === actor.personId);
      return ok({ items, canAdd: hr(actor) || lead, lastDays: items[0] ? diffDays(items[0].meetingDate, clock.today()) : null });
    },

    async addOneToOne(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(oneToOneSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      if (v.meetingDate > clock.today()) return invalid("Note a one-to-one after it happens.", { meetingDate: ["Pick today or an earlier day."] });
      return commit(store, async (repos) => {
        const p = await repos.people.findById(v.personId);
        if (!p) return notFound("That person");
        if (!hr(actor) && p.reportsToId !== actor.personId) return forbidden("Only their lead or HR notes a one-to-one.");
        if (p.id === actor.personId) return invalid("A one-to-one is with someone else.");
        const id = newId();
        await repos.talent.addOneToOne({ id, personId: p.id, leadId: actor.personId, meetingDate: v.meetingDate, discussed: v.discussed, agreed: v.agreed });
        return change({ id }, { actorId: actor.personId, action: "one_to_one.noted", entityType: "one_to_one", entityId: id, personId: p.id, data: { meetingDate: v.meetingDate } });
      });
    },

    async removeOneToOne(actor: Actor, id: string): Promise<Result<null>> {
      if (!isId(id)) return notFound("That note");
      return commit(store, async (repos) => {
        const o = await repos.talent.findOneToOne(id);
        if (!o) return notFound("That note");
        if (o.leadId !== actor.personId && !hr(actor)) return forbidden("Only who wrote it, or HR, removes a note.");
        await repos.talent.removeOneToOne(o.id, clock.now());
        return change(null, { actorId: actor.personId, action: "one_to_one.removed", entityType: "one_to_one", entityId: o.id, personId: o.personId });
      });
    },

    /** People whose last one-to-one is older than six weeks (or never), for HR's nudge list. */
    async overdueOneToOnes(actor: Actor): Promise<Result<Array<{ personId: string; fullName: string; lastDate: IsoDate | null; leadName: string | null }>>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      const [people, last] = await Promise.all([store.people.listActive(), store.talent.lastOneToOnes()]);
      const lastOf = new Map(last.map((l) => [l.personId, l.meetingDate]));
      const cutoff = addDays(clock.today(), -ONE_TO_ONE_GAP_DAYS);
      return ok(
        people
          .filter((p) => p.reportsToId && p.employmentType !== "freelancer" && diffDays(p.joinDate, clock.today()) >= 14)
          .filter((p) => (lastOf.get(p.id) ?? "") < cutoff)
          .map((p) => ({ personId: p.id, fullName: p.fullName, lastDate: lastOf.get(p.id) ?? null, leadName: p.reportsToName }))
          .sort((a, b) => (a.lastDate ?? "").localeCompare(b.lastDate ?? "")),
      );
    },

    // ---------- letters ----------

    async letterTemplates(actor: Actor): Promise<Result<Record<LetterKind, LetterTemplate>>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      return ok(await templates());
    },

    async saveLetterTemplates(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      const parsed = parse(templatesSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        await repos.calendar.setSetting(LETTER_SETTING, parsed.value, actor.personId);
        return change(null, { actorId: actor.personId, action: "setting.changed", entityType: "setting", entityId: LETTER_SETTING, data: { key: LETTER_SETTING } });
      });
    },

    /** The letter as it would be issued now: the template with this person's details. */
    /** A letter drafted from the record. No kind: the one HR most likely wants (an offer for someone new, test report L15). */
    async draftLetter(actor: Actor, personId: string, requested?: string): Promise<Result<{ kind: LetterKind; title: string; body: string; missing: LetterField[] }>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      if (!isId(personId) || (requested && !(LETTER_KINDS as readonly string[]).includes(requested))) return notFound("That letter");
      const [p, record, t] = await Promise.all([store.people.findById(personId), store.talent.internRecord(personId), templates()]);
      if (!p) return notFound("That person");
      const kind = (requested as LetterKind | undefined) || suggestLetterKind(p, clock.today());
      const w = kind === "internship_certificate" ? await work(p.id, p.joinDate, p.endDate ?? clock.today(), actor) : null;
      // Leavers: their last day. An intern still here: the planned end, else today (a certificate issued on the last
      // day). Anyone else still here has no end date yet, and the letter says so instead of "from today to today".
      const end = p.endDate ?? (kind === "internship_certificate" ? (record?.plannedEndDate ?? clock.today()) : null);
      const values = {
        name: p.fullName,
        job_title: p.jobTitle,
        department: p.departmentName,
        join_date: formatDate(p.joinDate),
        end_date: end ? formatDate(end) : null,
        today: formatDate(clock.today()),
        batch: record?.batch,
        mentor: record?.mentorName,
        worked_on: record?.workedOn ?? (w && w.recent.length ? [...new Set(w.recent.map((x) => x.clientName))].map((c) => `- Work for ${c}`).join("\n") : null),
        company: COMPANY,
      };
      const tpl = t[kind];
      return ok({ kind, title: fillLetter(tpl.title, values), body: fillLetter(tpl.body, values), missing: missingFields(`${tpl.title}\n${tpl.body}`, values) });
    },

    /** Issue a letter: the text (as drafted, or as HR edited it) is frozen with a reference number. */
    async issueLetter(actor: Actor, raw: unknown): Promise<Result<{ id: string; refNo: string }>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      const parsed = parse(letterSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      const draft = await service.draftLetter(actor, v.personId, v.kind);
      if (!draft.ok) return draft;
      const today = clock.today();
      return commit(store, async (repos) => {
        const year = Number(today.slice(0, 4));
        await repos.talent.lockLetterNumbers(year);
        const refNo = letterRef(year, await repos.talent.countLetters(year));
        const id = newId();
        await repos.talent.addLetter({ id, personId: v.personId, kind: v.kind, refNo, title: v.title ?? draft.value.title, body: v.body ?? draft.value.body, issuedOn: today, issuedById: actor.personId });
        return change({ id, refNo }, { actorId: actor.personId, action: "letter.issued", entityType: "letter", entityId: id, personId: v.personId, data: { kind: v.kind, refNo } });
      });
    },

    /** A person's letters: HR, or the person themselves. */
    async letters(actor: Actor, personId: string): Promise<LetterRow[]> {
      if (!isId(personId) || (!hr(actor) && actor.personId !== personId)) return [];
      return store.talent.letters(personId);
    },

    /** A letter: HR, or the person it is for. */
    async letter(actor: Actor, id: string): Promise<Result<LetterRow>> {
      const l = isId(id) ? await store.talent.findLetter(id) : null;
      if (!l || (!hr(actor) && l.personId !== actor.personId)) return notFound("That letter");
      return ok(l);
    },

    async withdrawLetter(actor: Actor, id: string): Promise<Result<null>> {
      if (!hr(actor)) return forbidden(HR_ONLY);
      return commit(store, async (repos) => {
        const l = isId(id) ? await repos.talent.findLetter(id) : null;
        if (!l) return notFound("That letter");
        await repos.talent.removeLetter(l.id, clock.now());
        return change(null, { actorId: actor.personId, action: "letter.withdrawn", entityType: "letter", entityId: l.id, personId: l.personId, data: { refNo: l.refNo } });
      });
    },
  };
  return service;
}

export type TalentService = ReturnType<typeof createTalentService>;
