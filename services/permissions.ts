// Roles → capabilities, from the permissions table in plan/3-projects-module.md and decisions D11–D18.
// Enforced here, in the service layer. Screens may hide things too, but that is never the protection.

import type { EmploymentType, Role } from "@/lib/types";
import type { ClientScope } from "@/repositories";

export const CAPABILITIES = [
  // Clients
  "clients.read.all", // every client
  "clients.read.assigned", // clients where they are on the team or own a task
  "clients.read.own_tasks", // only clients of tasks they own (name only)
  "clients.contacts.read", // contact people, phones, emails, GSTIN, billing address (D14)
  "clients.write",
  // Engagements and money
  "engagements.read",
  "engagements.write",
  "money.read", // fees, invoices
  "budget.read", // hours budgets and retainer burn
  // Projects and tasks
  "projects.read.all",
  "projects.read.assigned",
  "projects.write",
  "tasks.read.all",
  "tasks.read.assigned", // all tasks in projects of their clients
  "tasks.write.all",
  "time.read.all",
  "time.manage", // mark non-billable, edit locked entries
  // Creative
  "assets.read",
  "assets.write",
  "assets.approve",
  "ads.read",
  // Results per client (Stage 11.1): leads, spend, calls, admissions and targets
  "results.read",
  "results.write",
  // Client knowledge base (Stage 11.2): everyone who sees a client reads it; these edit it
  "knowledge.write",
  // Spaces (Stage 14.1): Oppllo's own work areas. Seeing private spaces you're not in is the owner's alone.
  "spaces.private.all",
  "spaces.manage", // add, rename, make private, archive
  "spaces.members", // add and remove members
  // Client portal (Stage 11.6): invite a client's contacts and revoke them
  "portal.invite",
  // Monthly client reports (Stage 11.4): draft, edit and make final (people with results.read read them)
  "reports.write",
  // People and HR
  "people.private.read",
  "people.write",
  "leave.read.all",
  "leave.manage", // leave types, quotas, holidays, comp-off grants
  "leave.approve.any",
  "hr.documents",
  "attendance.read.all", // everyone's attendance records and monthly summaries
  "attendance.manage", // correct or record attendance for anyone
  "access.manage", // the access register and joining/exit checklists
  // Sales (Stage 10a, D88): the prospect pipeline moved in from the CRM
  "leads.read", // leads, the pipeline and the sales dashboard (the CRM's marketing view)
  "leads.write", // work leads: stages, owners, notes, follow-ups (the CRM's sales role)
  // Platform
  "settings.manage",
  "audit.read",
  "dashboard.read", // the owner dashboard (Stage 8.4)
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * What everyone has, whatever their role: their own tasks and time, the team directory, their own
 * HR record and leave. These are checked by ownership in each service, not by capability.
 */
const CREATIVE: Capability[] = [
  "clients.read.assigned",
  "projects.read.assigned",
  "tasks.read.assigned",
  "assets.read",
  "assets.write",
];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: CAPABILITIES,
  strategist: [
    "clients.read.all",
    "clients.contacts.read",
    "clients.write",
    "engagements.read",
    "budget.read",
    "projects.read.all",
    "projects.write",
    "tasks.read.all",
    "tasks.write.all",
    "time.read.all",
    "time.manage",
    "assets.read",
    "assets.write",
    "assets.approve",
    "ads.read",
    "results.read",
    "results.write",
    "knowledge.write",
    "reports.write",
    "portal.invite",
    "leads.read",
  ],
  performance_marketer: [
    "clients.read.all",
    "clients.contacts.read",
    "engagements.read",
    "budget.read",
    "projects.read.all",
    "projects.write",
    "tasks.read.all",
    "tasks.write.all",
    "time.read.all",
    "assets.read",
    "assets.write",
    "ads.read",
    "results.read",
    "results.write",
    "leads.read",
  ],
  social_media: CREATIVE,
  designer: CREATIVE,
  video_editor: CREATIVE,
  bdo: [
    "clients.read.all",
    "clients.contacts.read",
    "clients.write",
    "engagements.read",
    "engagements.write",
    "money.read",
    "projects.read.all",
    "leads.read",
    "leads.write",
  ],
  hr: ["spaces.members", "people.private.read", "people.write", "leave.read.all", "leave.manage", "hr.documents", "attendance.read.all", "attendance.manage", "access.manage"],
  accountant: ["clients.read.all", "clients.contacts.read", "engagements.read", "money.read", "results.read"],
  intern: ["clients.read.own_tasks"],
};

export function capabilitiesFor(roles: readonly Role[]): Set<Capability> {
  const caps = new Set<Capability>();
  for (const role of roles) for (const cap of ROLE_CAPABILITIES[role]) caps.add(cap);
  return caps;
}

/** The signed-in person, as every service sees them. Built fresh per request from the database. */
export type Actor = {
  personId: string;
  fullName: string;
  email: string;
  roles: readonly Role[];
  employmentType: EmploymentType;
  capabilities: ReadonlySet<Capability>;
};

export const can = (actor: Actor, capability: Capability): boolean => actor.capabilities.has(capability);

/** Sees private spaces they aren't a member of: the owner only (Stage 14.1). */
export const seesAllSpaces = (actor: Actor) => can(actor, "spaces.private.all");

/** "Everything", for this person: private spaces they aren't in stay hidden unless they see all spaces. */
export const everything = (actor: Actor): { kind: "all"; viewerId?: string } => (seesAllSpaces(actor) ? { kind: "all" } : { kind: "all", viewerId: actor.personId });

/** How much of the client list a person may see. */
export function clientScope(actor: Actor): ClientScope {
  if (can(actor, "clients.read.all")) return everything(actor);
  if (can(actor, "clients.read.assigned")) return { kind: "assigned", personId: actor.personId };
  if (can(actor, "clients.read.own_tasks")) return { kind: "own_tasks", personId: actor.personId };
  return { kind: "none" };
}
