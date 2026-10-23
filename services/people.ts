// People records (HR slice 1): the team directory, profiles, HR create/edit, and self-service contact edits.
// Data safety (plan/4-hr-module.md, DPDP Act): minimum data; private fields only for the person, HR and the
// owner; every view of someone else's private fields is written to the audit log.

import { z } from "zod";
import { addDays, type IsoDate } from "@/lib/dates";
import { newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { EmploymentType, PersonStatus, Role, WorkLocation } from "@/lib/types";
import { id, optionalId, parse } from "@/lib/validation/common";
import { markLeftSchema, myContactSchema, onlySent, personSchema } from "@/lib/validation/people";
import type { DataStore, DepartmentRecord, NewEvent, PersonPrivateRecord, PersonRecord, Repositories } from "@/repositories";
import { startChecklistIn } from "./access";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, type Actor } from "./permissions";
import { endAllSpaceAccess } from "./space-access";

/** What everyone can see about everyone (D17). */
export type DirectoryEntry = {
  id: string;
  fullName: string;
  jobTitle: string;
  roles: Role[];
  departmentName: string | null;
  workEmail: string;
  workPhone: string | null;
  workLocation: WorkLocation;
  reportsToName: string | null;
  status: PersonStatus;
};

/** The person, HR and the owner also see these. */
export type PersonPrivateView = PersonPrivateRecord & {
  employmentType: EmploymentType;
  joinDate: IsoDate;
  endDate: IsoDate | null;
  capacityMinutesPerWeek: number;
  departmentId: string | null;
  reportsToId: string | null;
};

export type Profile = {
  person: DirectoryEntry;
  private: PersonPrivateView | null;
  canEdit: boolean;
  canEditOwnContact: boolean;
};

const toEntry = (p: PersonRecord): DirectoryEntry => ({
  id: p.id,
  fullName: p.fullName,
  jobTitle: p.jobTitle,
  roles: p.roles,
  departmentName: p.departmentName,
  workEmail: p.workEmail,
  workPhone: p.workPhone,
  workLocation: p.workLocation,
  reportsToName: p.reportsToName,
  status: p.status,
});

/** Roles only the owner may give or take away: they unlock everything, or everyone's personal data. */
const OWNER_ONLY_ROLES: Role[] = ["owner", "hr"];

/**
 * Who may edit or exit whom (review fix): only the owner touches people holding the Owner or HR role,
 * including HR's own record (HR uses "My details" for their own contact fields).
 */
function guardTarget(actor: Actor, target: PersonRecord) {
  const isOwner = actor.roles.includes("owner");
  if (isOwner) return null;
  if (target.id === actor.personId) return forbidden("Use “My details” for your own contact details; ask the owner for anything else.");
  if (target.roles.some((r) => OWNER_ONLY_ROLES.includes(r))) return forbidden("Only the owner can change someone with the Owner or HR role.");
  return null;
}

const teamSchema = z.object({
  departmentId: optionalId,
  name: z.string().trim().min(1, { message: "Give the team a name." }).max(60, { message: "Keep it under 60 characters." }),
  headPersonId: optionalId,
});

export function createPeopleService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  /** Role-change rules shared by create and update. */
  async function checkRoles(repos: Repositories, actor: Actor, personId: string | null, before: readonly Role[], after: readonly Role[]) {
    if (personId === actor.personId && [...before].sort().join() !== [...after].sort().join()) {
      return forbidden("You can't change your own roles. Ask the owner.");
    }
    const touched = [...after.filter((r) => !before.includes(r)), ...before.filter((r) => !after.includes(r))];
    if (touched.some((r) => OWNER_ONLY_ROLES.includes(r)) && !actor.roles.includes("owner")) {
      return forbidden("Only the owner can give or take away the Owner and HR roles.");
    }
    if (before.includes("owner") && !after.includes("owner")) {
      const owners = (await repos.people.listActive()).filter((p) => p.roles.includes("owner") && p.id !== personId);
      if (owners.length === 0) return conflict("Oppllo One needs at least one owner.");
    }
    return null;
  }

  async function checkLinks(repos: Repositories, personId: string | null, departmentId: string | null, reportsToId: string | null) {
    if (departmentId && !(await repos.people.listDepartments()).some((d) => d.id === departmentId)) {
      return invalid("Pick a department.", { departmentId: ["Pick a department."] });
    }
    if (reportsToId) {
      if (reportsToId === personId) return invalid("Someone can't report to themselves.", { reportsToId: ["Pick someone else."] });
      const manager = await repos.people.findById(reportsToId);
      if (!manager || manager.status !== "active") return invalid("Pick an active person.", { reportsToId: ["Pick an active person."] });
    }
    return null;
  }

  return {
    async directory(actor: Actor, opts: { includeLeft?: boolean } = {}): Promise<Result<DirectoryEntry[]>> {
      const people = opts.includeLeft && can(actor, "people.private.read") ? await store.people.listAll() : await store.people.listActive();
      return ok(people.map(toEntry));
    },

    async departments(_actor: Actor): Promise<Result<DepartmentRecord[]>> {
      return ok(await store.people.listDepartments());
    },

    /** Add a team or change its name and head (test report L16). HR and the owner. */
    async saveTeam(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "people.write")) return forbidden("HR and the owner set up teams.");
      const parsed = parse(teamSchema, raw);
      if (!parsed.ok) return parsed;
      const { departmentId, name, headPersonId } = parsed.value;
      return commit(store, async (repos) => {
        const teams = await repos.people.listDepartments();
        const before = departmentId ? teams.find((d) => d.id === departmentId) : null;
        if (departmentId && !before) return notFound("That team");
        if (teams.some((d) => d.id !== departmentId && d.name.toLowerCase() === name.toLowerCase())) return invalid("There's already a team with that name.", { name: ["There's already a team with that name."] });
        if (headPersonId) {
          const head = await repos.people.findById(headPersonId);
          if (!head || head.status !== "active") return invalid("Pick someone on the team.", { headPersonId: ["Pick an active person."] });
        }
        if (!before) {
          const id = newId();
          await repos.people.addDepartment(id, { name, headPersonId });
          return change({ id }, { actorId: actor.personId, action: "department.created", entityType: "department", entityId: id, data: { name, headPersonId } });
        }
        if (before.name === name && before.headPersonId === headPersonId) return noChange({ id: before.id });
        await repos.people.updateDepartment(before.id, { name, headPersonId });
        return change({ id: before.id }, { actorId: actor.personId, action: "department.updated", entityType: "department", entityId: before.id, data: { from: { name: before.name, headPersonId: before.headPersonId }, to: { name, headPersonId } } });
      });
    },

    /** Retire a team nobody is in any more (kept for history, never deleted). */
    async removeTeam(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "people.write")) return forbidden("HR and the owner set up teams.");
      const parsed = parse(z.object({ departmentId: id }), raw);
      if (!parsed.ok) return notFound("That team");
      const { departmentId } = parsed.value;
      return commit(store, async (repos) => {
        const team = (await repos.people.listDepartments()).find((d) => d.id === departmentId);
        if (!team) return notFound("That team");
        const inIt = (await repos.people.listActive()).filter((p) => p.departmentId === departmentId).length;
        if (inIt) return conflict(`${inIt} ${inIt === 1 ? "person is" : "people are"} still in ${team.name}. Move them to another team first.`);
        await repos.people.updateDepartment(departmentId, { deletedAt: clock.now() });
        return change({ id: departmentId }, { actorId: actor.personId, action: "department.removed", entityType: "department", entityId: departmentId, data: { name: team.name } });
      });
    },

    async profile(actor: Actor, personId: string): Promise<Result<Profile>> {
      const person = await store.people.findById(personId);
      const self = personId === actor.personId;
      const canPrivate = self || can(actor, "people.private.read");
      // People who left are visible only to HR and the owner.
      if (!person || (person.status !== "active" && !canPrivate)) return notFound("That person");

      let privateView: PersonPrivateView | null = null;
      if (canPrivate) {
        const priv = await store.people.findPrivate(personId);
        privateView = {
          ...(priv ?? { personalEmail: null, personalPhone: null, emergencyContactName: null, emergencyContactPhone: null, emergencyContactRelation: null }),
          employmentType: person.employmentType,
          joinDate: person.joinDate,
          endDate: person.endDate,
          capacityMinutesPerWeek: person.capacityMinutesPerWeek,
          departmentId: person.departmentId,
          reportsToId: person.reportsToId,
        };
        if (!self) {
          // Every view of someone else's sensitive record is audited.
          await commit(store, async () =>
            change(null, { actorId: actor.personId, action: "person.private_viewed", entityType: "person", entityId: personId, personId }),
          );
        }
      }
      return ok({ person: toEntry(person), private: privateView, canEdit: can(actor, "people.write"), canEditOwnContact: self });
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "people.write")) return forbidden("Only HR and the owner add people.");
      const parsed = parse(personSchema, raw);
      if (!parsed.ok) return parsed;
      const { roles, capacityHoursPerWeek, ...fields } = parsed.value;
      return commit(store, async (repos) => {
        if (await repos.people.findByEmail(fields.workEmail)) {
          return invalid("Someone already signs in with that email.", { workEmail: ["Already used by someone on the team."] });
        }
        const roleProblem = await checkRoles(repos, actor, null, [], roles);
        if (roleProblem) return roleProblem;
        const linkProblem = await checkLinks(repos, null, fields.departmentId, fields.reportsToId);
        if (linkProblem) return linkProblem;
        const id = newId();
        await repos.people.create(id, { ...fields, capacityMinutesPerWeek: Math.round(capacityHoursPerWeek * 60) });
        await repos.people.setRoles(id, roles);
        // Joining → access: the joining checklist starts with the person (plan/4-hr-module.md).
        const checklist = await startChecklistIn(repos, { personId: id, kind: "joining", actorId: actor.personId });
        return change({ id }, { actorId: actor.personId, action: "person.created", entityType: "person", entityId: id, personId: id, data: { roles, employmentType: fields.employmentType } }, ...checklist);
      });
    },

    async update(actor: Actor, personId: string, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "people.write")) return forbidden("Only HR and the owner edit people.");
      const parsed = parse(personSchema, raw);
      if (!parsed.ok) return parsed;
      const { roles, capacityHoursPerWeek, ...fields } = parsed.value;
      return commit(store, async (repos) => {
        // Lock the record so two edits can't interleave.
        const person = await repos.people.lockForUpdate(personId);
        if (!person) return notFound("That person");
        const guard = guardTarget(actor, person);
        if (guard) return guard;
        const isOwner = actor.roles.includes("owner");
        // The sign-in email is the key to the account: only the owner may change someone else's.
        if (fields.workEmail.toLowerCase() !== person.workEmail.toLowerCase() && !isOwner) {
          return forbidden("Only the owner can change the email someone signs in with.");
        }
        // Making yourself someone's manager would make you their leave approver (D42).
        if (fields.reportsToId === actor.personId && person.reportsToId !== actor.personId && !isOwner) {
          return forbidden("Only the owner can make you someone's manager.");
        }
        const other = await repos.people.findByEmail(fields.workEmail);
        if (other && other.id !== personId) return invalid("Someone else signs in with that email.", { workEmail: ["Already used by someone on the team."] });
        const roleProblem = await checkRoles(repos, actor, personId, person.roles, roles);
        if (roleProblem) return roleProblem;
        const linkProblem = await checkLinks(repos, personId, fields.departmentId, fields.reportsToId);
        if (linkProblem) return linkProblem;

        const capacityMinutesPerWeek = Math.round(capacityHoursPerWeek * 60);
        const priv = await repos.people.findPrivate(personId);
        const before: Record<string, unknown> = { ...person, ...priv };
        await repos.people.update(personId, { ...fields, capacityMinutesPerWeek });
        await repos.people.setRoles(personId, roles);
        // Record which fields changed (names only for personal fields; roles and capacity with values).
        const changed = (Object.keys(fields) as Array<keyof typeof fields>).filter((k) => (before[k] ?? null) !== (fields[k] ?? null));
        return change({ id: personId }, {
          actorId: actor.personId,
          action: "person.updated",
          entityType: "person",
          entityId: personId,
          personId,
          data: {
            fields: changed,
            ...(person.capacityMinutesPerWeek !== capacityMinutesPerWeek ? { capacity: { from: person.capacityMinutesPerWeek, to: capacityMinutesPerWeek } } : {}),
            ...([...person.roles].sort().join() !== [...roles].sort().join() ? { roles: { from: person.roles, to: roles } } : {}),
          },
        });
      });
    },

    /** Anyone may keep their own phones and emergency contact up to date (D50). */
    async updateMyContact(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(myContactSchema, raw);
      if (!parsed.ok) return parsed;
      const sent = onlySent(parsed.value, raw);
      if (Object.keys(sent).length === 0) return invalid("Nothing to save.");
      return commit(store, async (repos) => {
        await repos.people.update(actor.personId, sent);
        return change({ id: actor.personId }, {
          actorId: actor.personId,
          action: "person.contact_updated",
          entityType: "person",
          entityId: actor.personId,
          personId: actor.personId,
          data: { fields: Object.keys(sent) },
        });
      });
    },

    /** Mark someone as having left: they can no longer sign in. The exit checklist arrives in HR slice 2. */
    async markLeft(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "people.write")) return forbidden("Only HR and the owner record leavers.");
      const parsed = parse(markLeftSchema, raw);
      if (!parsed.ok) return parsed;
      const { personId, endDate } = parsed.value;
      if (personId === actor.personId) return forbidden("Ask the owner to record your own exit.");
      return commit(store, async (repos) => {
        const person = await repos.people.lockForUpdate(personId);
        if (!person || person.status !== "active") return notFound("That person");
        const guard = guardTarget(actor, person);
        if (guard) return guard;
        if (person.roles.includes("owner")) {
          const owners = (await repos.people.listActive()).filter((p) => p.roles.includes("owner") && p.id !== personId);
          if (owners.length === 0) return conflict("Oppllo One needs at least one owner.");
        }
        if (endDate > clock.today()) return invalid("Record the exit on or after their last day.", { endDate: ["Can't be in the future."] });
        await repos.people.update(personId, { status: "left", endDate });

        // Their leave after the last day no longer applies; requests waiting on them go to the owner.
        const theirs = await repos.leave.listRequests({ personIds: [personId], statuses: ["pending", "approved"] });
        const events: NewEvent[] = [];
        for (const r of theirs) {
          if (r.startDate > endDate) {
            await repos.leave.updateRequest(r.id, { status: "cancelled", decisionNote: "Cancelled: left Oppllo" });
            events.push({ actorId: actor.personId, action: "leave.cancelled", entityType: "leave_request", entityId: r.id, personId, data: { reason: "left" } });
          } else if (r.endDate > endDate && r.status === "approved") {
            await repos.leave.updateRequest(r.id, { cancelledFrom: addDays(endDate, 1), cancelRequestedFrom: null });
            events.push({ actorId: actor.personId, action: "leave.cut_short", entityType: "leave_request", entityId: r.id, personId, data: { reason: "left" } });
          }
        }
        const active = await repos.people.listActive();
        const owner = active.find((p) => p.roles.includes("owner") && p.id !== personId);
        const waiting = [
          ...(await repos.leave.listRequests({ approverId: personId, statuses: ["pending"] })),
          ...(await repos.leave.listRequests({ approverId: personId, statuses: ["approved"], withCancelRequest: true })),
        ];
        for (const r of waiting) {
          await repos.leave.updateRequest(r.id, { approverId: owner?.id ?? null });
          events.push({ actorId: actor.personId, action: "leave.rerouted", entityType: "leave_request", entityId: r.id, personId: r.personId, data: { from: personId, to: owner?.id ?? null } });
        }
        // Exit → spaces (Stage 14.2): every space membership and open access request ends now.
        events.push(...(await endAllSpaceAccess(repos, personId, actor.personId, clock.now())));
        // Exit → security: the exit checklist (every open access, client and task) starts now if HR hadn't started it.
        events.push(...(await startChecklistIn(repos, { personId, kind: "exit", actorId: actor.personId })));
        return change({ id: personId }, { actorId: actor.personId, action: "person.left", entityType: "person", entityId: personId, personId, data: { endDate } }, ...events);
      });
    },
  };
}

export type PeopleService = ReturnType<typeof createPeopleService>;
