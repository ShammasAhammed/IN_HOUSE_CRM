// The client portal (Stage 11.6): a client's own contacts see their results, what was delivered and what's next,
// approve creatives or ask for changes, send requests, and read final monthly reports, without asking anyone.
//
// D-11.6a: a portal user is one invited contact of one client (portal_users), never a person at Oppllo. They sign in
//   with Google (the invited email) or a one-time link (only its hash is kept; single use; 30 minutes, 7 days for an
//   invite). No passwords. Every request checks again: not revoked, still a live contact with the same email, client
//   still a real, live client. Revoking, or removing the contact, closes access at once.
// D-11.6b: a portal user has no Actor and so no staff capability at all. Every method here takes a PortalSession whose
//   client is fixed; nothing reads people, spaces, leads, money, hours or other clients. Staff screens and APIs need
//   an Actor, which a portal session never yields (lib/server/session.ts sends it to /portal).
// D-11.6c: what clients see: this month's results and health in plain words (no hours, burn or fees), what was
//   delivered and what's coming, creatives waiting for them with their own team's comments only, final reports. Their
//   approval or change request is recorded as their own decision (the comment is theirs, with who and when), so no
//   staff "on behalf" step is needed. A request becomes a task for the lead strategist, tagged Request.
import { createHash, randomBytes } from "node:crypto";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { addDays, endOfMonth, istInstant, startOfMonth, type IsoDate } from "@/lib/dates";
import { isId, newId } from "@/lib/id";
import { conflict, forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import { optionalDate, optionalText, parse } from "@/lib/validation/common";
import type { DataStore, FileStorage, Mailer, NewEvent, PortalUserRecord, Repositories } from "@/repositories";
import { change, commit } from "./change";
import type { Clock } from "./clock";
import { readyOnApproval } from "./content";
import { can, clientScope, type Actor } from "./permissions";
import { nextState } from "./rules/assets";
import type { ReportFacts } from "./rules/reports";
import { clientHealth, costPer, judgedMonth, ratePercent } from "./rules/results";

const LINK_MINUTES = 30;
const INVITE_DAYS = 7;
const FILE_SECONDS = 60 * 60;
export const PORTAL_TERMS =
  "Use the Oppllo client portal: see this institution's results, creatives and reports, approve work, send requests and message the Oppllo team. Oppllo keeps a record of what you approve, ask for and write.";

export type PortalSession = { id: string; clientId: string; clientName: string; contactId: string; name: string; email: string; agreed: boolean; leadStrategistId: string | null };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const live = (u: PortalUserRecord) => !u.revokedAt && u.clientLive && u.contactEmail === u.email.toLowerCase();
const toSession = (u: PortalUserRecord): PortalSession => ({ id: u.id, clientId: u.clientId, clientName: u.clientName, contactId: u.contactId, name: u.contactName, email: u.email, agreed: Boolean(u.consentId), leadStrategistId: u.leadStrategistId });

const decideSchema = z.object({
  assetId: z.uuid(),
  versionId: z.uuid(),
  decision: z.enum(["approve", "changes"]),
  note: optionalText(2000),
});
const commentSchema = z.object({ assetId: z.uuid(), versionId: z.uuid(), body: z.string().trim().min(1, { message: "Write something first." }).max(2000) });
const requestSchema = z.object({
  title: z.string().trim().min(3, { message: "Say in a few words what you need." }).max(150),
  details: optionalText(3000),
  neededBy: optionalDate,
});

export type PortalHome = {
  clientName: string;
  month: IsoDate;
  results: { leads: number | null; admissions: number | null; callsBooked: number | null; targetLeads: number | null; targetAdmissions: number | null; costPerLeadPaise: number | null; leadToAdmissionPercent: number | null } | null;
  health: { level: "on_track" | "at_risk" | "off_track" | "no_target"; reasons: string[] };
  delivered: { deliverables: Array<{ name: string; delivered: number; target: number }>; postsPublished: number; creativesApproved: number };
  next: Array<{ title: string; publishOn: IsoDate; channel: string }>;
  waiting: number;
};
export type PortalCreative = {
  id: string;
  title: string;
  kind: string;
  version: number;
  versionId: string;
  /** Opens the file: a short-lived link made for this person, or the outside link it is. */
  url: string;
  fileName: string;
  comments: Array<{ id: string; by: string; body: string; createdAt: Date }>;
};

export function createPortalService(deps: { store: DataStore; clock: Clock; storage: FileStorage; mailer: Mailer; emailReady: boolean; appUrl: string; logLinks: boolean }) {
  const { store, clock } = deps;

  async function makeLink(repos: Pick<Repositories, "portal">, portalUserId: string, minutes: number): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await repos.portal.addToken({ tokenHash: hash(token), portalUserId, expiresAt: new Date(clock.now().getTime() + minutes * 60_000) });
    return `${deps.appUrl}/portal/link/${token}`;
  }

  /** Send the link, or say why it couldn't go out. In development it is also printed, so it can be tried locally. */
  async function deliver(to: string, subject: string, text: string, link: string): Promise<boolean> {
    if (deps.logLinks) console.info(`[portal] sign-in link for ${to}: ${link}`);
    if (!deps.emailReady) return false;
    await deps.mailer.send({ to, subject, text: `${text}\n\n${link}\n\nThe link works once. If you didn't expect this, ignore it.` });
    return true;
  }

  const portalEvent = (u: Pick<PortalSession, "id" | "clientId" | "name">, action: string, data: Record<string, unknown> = {}, entity?: { type: NewEvent["entityType"]; id: string }): NewEvent => ({
    actorId: null,
    action,
    entityType: entity?.type ?? "portal_user",
    entityId: entity?.id ?? u.id,
    clientId: u.clientId,
    data: { by: u.name, portalUserId: u.id, ...data },
  });

  async function signedIn(u: PortalUserRecord): Promise<string> {
    await commit(store, async (repos) => {
      await repos.portal.touchSignIn(u.id, clock.now());
      return change(null, portalEvent(toSession(u), "portal.signed_in"));
    });
    return u.id;
  }

  /** The creative, when it belongs to this client and is waiting for them. */
  async function waitingCreative(repos: Pick<Repositories, "assets">, ps: PortalSession, assetId: string) {
    if (!isId(assetId)) return null;
    const a = await repos.assets.findById(assetId, { kind: "all" });
    return a && a.clientId === ps.clientId && !a.clientIsInternal && a.approvalState === "client_review" ? a : null;
  }

  return {
    // ---------- staff: invite and revoke ----------

    /** A client's contacts with their portal status (owner and strategists). */
    async invites(actor: Actor, clientId: string): Promise<Result<{ contacts: Array<{ contactId: string; name: string; email: string | null; invite: { id: string; status: "invited" | "active" | "revoked"; lastSignInAt: Date | null; invitedByName: string } | null }>; emailReady: boolean }>> {
      if (!can(actor, "portal.invite")) return forbidden("The owner and strategists invite clients to the portal.");
      const client = isId(clientId) ? await store.clients.findById(clientId, clientScope(actor)) : null;
      if (!client || client.isInternal) return notFound("That client");
      const [contacts, invites] = await Promise.all([store.clients.listContacts([client.id]), store.portal.listForClient(client.id)]);
      return ok({
        contacts: contacts.map((c) => {
          const i = invites.find((x) => x.contactId === c.id && !x.revokedAt) ?? invites.find((x) => x.contactId === c.id);
          return { contactId: c.id, name: c.name, email: c.email, invite: i ? { id: i.id, status: i.revokedAt ? "revoked" : i.lastSignInAt ? "active" : "invited", lastSignInAt: i.lastSignInAt, invitedByName: i.invitedByName } : null };
        }),
        emailReady: deps.emailReady,
      });
    },

    /** Invite a contact by their email. Without email sending, the inviter gets the link to pass on, and is told why. */
    async invite(actor: Actor, raw: unknown): Promise<Result<{ emailSent: boolean; link: string | null }>> {
      if (!can(actor, "portal.invite")) return forbidden("The owner and strategists invite clients to the portal.");
      const parsed = parse(z.object({ clientId: z.uuid(), contactId: z.uuid() }), raw);
      if (!parsed.ok) return parsed;
      const { clientId, contactId } = parsed.value;
      const client = await store.clients.findById(clientId, clientScope(actor));
      if (!client || client.isInternal) return notFound("That client");
      const contact = (await store.clients.listContacts([client.id])).find((c) => c.id === contactId);
      if (!contact) return notFound("That contact");
      if (!contact.email) return invalid(`Add ${contact.name}'s email first: the portal signs in with it.`);
      const id = newId();
      let link = "";
      const r = await commit(store, async (repos) => {
        if (!(await repos.portal.create({ id, clientId: client.id, contactId: contact.id, email: contact.email!, invitedById: actor.personId }))) {
          return conflict(`${contact.email} already has a portal invite. Revoke it first to invite again.`);
        }
        link = await makeLink(repos, id, INVITE_DAYS * 24 * 60);
        return change(null, { actorId: actor.personId, action: "portal.invited", entityType: "portal_user", entityId: id, clientId: client.id, data: { name: contact.name, email: contact.email } });
      });
      if (!r.ok) return r;
      const sent = await deliver(contact.email, `${client.name} on Oppllo One`, `Hello ${contact.name}, Oppllo has invited you to see ${client.name}'s results, creatives and reports, and to send requests. Open this link to sign in (it works once, for ${INVITE_DAYS} days):`, link);
      return ok({ emailSent: sent, link: sent ? null : link });
    },

    async revoke(actor: Actor, raw: unknown): Promise<Result<null>> {
      if (!can(actor, "portal.invite")) return forbidden("The owner and strategists manage portal access.");
      const parsed = parse(z.object({ portalUserId: z.uuid() }), raw);
      if (!parsed.ok) return parsed;
      const u = await store.portal.find(parsed.value.portalUserId);
      if (!u || !(await store.clients.findById(u.clientId, clientScope(actor)))) return notFound("That invite");
      return commit(store, async (repos) => {
        if (!(await repos.portal.revoke(u.id, actor.personId, clock.now()))) return conflict("It was already revoked.");
        return change(null, { actorId: actor.personId, action: "portal.revoked", entityType: "portal_user", entityId: u.id, clientId: u.clientId, data: { name: u.contactName } });
      });
    },

    // ---------- signing in ----------

    /** "Email me a link". Always the same answer, so nobody can find out who is invited. */
    async requestLink(email: string): Promise<{ devLink: string | null }> {
      const u = email.includes("@") ? await store.portal.findByEmail(email) : null;
      if (!u || !live(u)) return { devLink: null };
      const link = await makeLink(store, u.id, LINK_MINUTES);
      await deliver(u.email, `Sign in to ${u.clientName} on Oppllo One`, `Open this link within ${LINK_MINUTES} minutes to sign in:`, link);
      return { devLink: deps.logLinks ? link : null };
    },

    /** A one-time link pressed: the portal user it signs in, or null. */
    async redeem(token: string): Promise<string | null> {
      if (!/^[\w-]{20,100}$/.test(token)) return null;
      const id = await store.portal.useToken(hash(token), clock.now());
      const u = id ? await store.portal.find(id) : null;
      return u && live(u) ? signedIn(u) : null;
    },

    /** Google sign-in for a client: the verified Google email must be a live invite. */
    async google(email: string): Promise<string | null> {
      const u = await store.portal.findByEmail(email);
      return u && live(u) ? signedIn(u) : null;
    },

    /** The live portal user for a verified email, without recording a sign-in (the session token needs the id). */
    async idForEmail(email: string): Promise<string | null> {
      const u = await store.portal.findByEmail(email);
      return u && live(u) ? u.id : null;
    },

    /** Checked on every request: null as soon as the invite is revoked, the contact removed or changed. */
    async session(portalUserId: string): Promise<PortalSession | null> {
      if (!isId(portalUserId)) return null;
      const u = await store.portal.find(portalUserId);
      return u && live(u) ? toSession(u) : null;
    },

    /** DPDP (11.7): the contact agrees to the portal's terms before seeing anything; recorded as their consent. */
    async agree(ps: PortalSession): Promise<Result<null>> {
      if (ps.agreed) return ok(null);
      const consentId = newId();
      return commit(store, async (repos) => {
        await repos.consent.add({ id: consentId, subjectType: "client_contact", subjectId: ps.contactId, purpose: PORTAL_TERMS, method: "form", givenAt: clock.now(), note: "Client portal, on first sign-in", recordedById: null });
        await repos.portal.setConsent(ps.id, consentId);
        return change(null, portalEvent(ps, "consent.recorded", { purpose: PORTAL_TERMS, subjectType: "client_contact", subjectId: ps.contactId, method: "form" }, { type: "consent_record", id: consentId }));
      });
    },

    // ---------- what the client sees and does ----------

    async home(ps: PortalSession): Promise<PortalHome> {
      const today = clock.today();
      const month = startOfMonth(today);
      const last = endOfMonth(today);
      const [from, to] = [istInstant(month, "00:00"), istInstant(addDays(last, 1), "00:00")];
      const judged = judgedMonth(today).month;
      const [rows, engagements, posts, approved, waiting, next] = await Promise.all([
        store.results.list({ clientIds: [ps.clientId], from: judged < month ? judged : month, to: month }),
        store.engagements.listForClients([ps.clientId], { on: today, includeFees: false, includeBudgets: false, activeOnly: true }),
        store.content.list({ clientId: ps.clientId, from: month, to: last }),
        store.assets.list({ scope: { kind: "all" }, clientId: ps.clientId, states: ["approved"], limit: 500 }),
        store.assets.list({ scope: { kind: "all" }, clientId: ps.clientId, states: ["client_review"], limit: 100 }),
        store.content.upcoming(ps.clientId, today, 5),
      ]);
      const deliverables = await store.engagements.deliverablesProgress(engagements.filter((e) => e.kind === "retainer").map((e) => e.id), month, last);
      const r = rows.find((x) => x.month === month) ?? null;
      // Health is judged on results and targets only: hours and retainer burn are Oppllo's own business.
      const health = clientHealth({ today, results: rows.find((x) => x.month === judged) ?? null, burnPercent: null });
      return {
        clientName: ps.clientName,
        month,
        results: r ? { leads: r.leads, admissions: r.admissions, callsBooked: r.callsBooked, targetLeads: r.targetLeads, targetAdmissions: r.targetAdmissions, costPerLeadPaise: costPer(r.spendPaise, r.leads), leadToAdmissionPercent: ratePercent(r.admissions, r.leads) } : null,
        health: { level: health.level, reasons: health.reasons },
        delivered: {
          deliverables: deliverables.map((d) => ({ name: d.name, delivered: d.delivered, target: d.targetCount })),
          postsPublished: posts.filter((p) => p.status === "published").length,
          creativesApproved: approved.filter((a) => a.updatedAt >= from && a.updatedAt < to).length,
        },
        next: next.map((n) => ({ title: n.title, publishOn: n.publishOn, channel: n.channel })),
        waiting: waiting.length,
      };
    },

    /** Creatives waiting for the client, with their own team's comments only (never staff comments). */
    async creatives(ps: PortalSession): Promise<PortalCreative[]> {
      const list = await store.assets.list({ scope: { kind: "all" }, clientId: ps.clientId, states: ["client_review"], limit: 100 });
      const out: PortalCreative[] = [];
      for (const a of list) {
        const [versions, comments] = await Promise.all([store.assets.listVersions(a.id), store.assets.listComments(a.id)]);
        const v = versions[0];
        if (!v) continue;
        const url = v.provider === "external_link" ? v.location : await deps.storage.getLink(v, { expiresInSeconds: FILE_SECONDS, downloadName: v.fileName, viewerId: `portal:${ps.id}` });
        out.push({
          id: a.id,
          title: a.title,
          kind: a.kind,
          version: v.version,
          versionId: v.id,
          url,
          fileName: v.fileName,
          comments: comments.filter((c) => c.portalUserId !== null).map((c) => ({ id: c.id, by: c.authorName, body: c.body, createdAt: c.createdAt })),
        });
      }
      return out;
    },

    /** The client's own decision on the version they looked at. Asking for changes needs a note. */
    async decide(ps: PortalSession, raw: unknown): Promise<Result<{ state: "approved" | "changes_requested" }>> {
      const parsed = parse(decideSchema, raw);
      if (!parsed.ok) return parsed;
      const { assetId, versionId, decision, note } = parsed.value;
      if (decision === "changes" && !note) return invalid("Say what should change.", { note: ["Say what should change, so the next version gets it right."] });
      const action = decision === "approve" ? "client_approved" : "client_changes";
      return commit(store, async (repos) => {
        await repos.assets.lockForUpdate(assetId);
        const asset = await waitingCreative(repos, ps, assetId);
        if (!asset) return notFound("That creative isn't waiting for you any more.");
        const to = nextState(asset.approvalState, action, false);
        const current = (await repos.assets.listVersions(asset.id))[0];
        if (!to || !current) return conflict("That creative changed. Refresh to see it.");
        if (current.id !== versionId) return conflict(`Version ${current.version} was added since you opened this. Look at it, then decide.`);
        const approved = to === "approved";
        await repos.assets.update(asset.id, { approvalState: to, ...(approved ? { approvedVersionId: current.id, approvedById: null, approvedAt: clock.now() } : {}) });
        await repos.assets.addComment({ id: newId(), assetId: asset.id, versionId: current.id, authorId: null, portalUserId: ps.id, action, body: note ?? "", atSeconds: null });
        const moved = approved ? await readyOnApproval(repos, { assetId: asset.id, clientId: asset.clientId, actorId: null }) : [];
        return change(
          { state: to as "approved" | "changes_requested" },
          portalEvent(ps, `asset.${action}`, { title: asset.title, version: current.version, byClient: true, ...(note ? { note } : {}) }, { type: "asset", id: asset.id }),
          ...moved,
        );
      });
    },

    async comment(ps: PortalSession, raw: unknown): Promise<Result<{ id: string }>> {
      const parsed = parse(commentSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const asset = await waitingCreative(repos, ps, v.assetId);
        if (!asset) return notFound("That creative isn't waiting for you any more.");
        if (!(await repos.assets.listVersions(asset.id)).some((x) => x.id === v.versionId)) return notFound("That version");
        const id = newId();
        await repos.assets.addComment({ id, assetId: asset.id, versionId: v.versionId, authorId: null, portalUserId: ps.id, action: null, body: v.body, atSeconds: null });
        return change({ id }, portalEvent(ps, "asset.commented", { title: asset.title, byClient: true }, { type: "asset", id: asset.id }));
      });
    },

    /** A request becomes a task for the client's lead strategist, in their newest active project, tagged Request. */
    async request(ps: PortalSession, raw: unknown): Promise<Result<{ taskId: string }>> {
      const parsed = parse(requestSchema, raw);
      if (!parsed.ok) return parsed;
      const v = parsed.value;
      return commit(store, async (repos) => {
        const projects = (await repos.projects.list({ clientIds: [ps.clientId], scope: { kind: "all" }, statuses: ["active"], today: clock.today() })).sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
        const project = projects[0];
        if (!project) return conflict("Your Oppllo team hasn't set up a project yet. Please message them directly for now.");
        const lead = ps.leadStrategistId ? await repos.people.findById(ps.leadStrategistId) : null;
        const ownerId = lead?.status === "active" ? lead.id : null;
        const taskId = newId();
        await repos.tasks.create(taskId, {
          projectId: project.id,
          clientId: ps.clientId,
          parentTaskId: null,
          title: v.title,
          description: `${v.details ? `${v.details}\n\n` : ""}Sent by ${ps.name} through the client portal.`,
          status: "todo",
          priority: "normal",
          ownerId,
          reviewerId: null,
          stageId: null,
          deliverableId: null,
          startDate: null,
          dueDate: v.neededBy && v.neededBy >= clock.today() ? v.neededBy : null,
          estimateMinutes: null,
          completedAt: null,
          rank: generateKeyBetween(await repos.tasks.lastRank(project.id, "todo"), null),
          recurrenceId: null,
          createdById: null,
        });
        await repos.tasks.update(taskId, { tags: ["Request"] });
        return change(
          { taskId },
          { actorId: null, action: "task.created", entityType: "task", entityId: taskId, clientId: ps.clientId, data: { title: v.title, ownerId, form: "Client portal", by: ps.name } },
          portalEvent(ps, "portal.request_sent", { title: v.title, taskId }),
        );
      });
    },

    /** Final monthly reports (11.4), newest first. Drafts stay inside Oppllo. */
    async reports(ps: PortalSession): Promise<IsoDate[]> {
      return (await store.reports.list(ps.clientId)).filter((r) => r.status === "final").map((r) => r.month);
    },

    async report(ps: PortalSession, monthRaw: string): Promise<Result<{ month: IsoDate; facts: ReportFacts; summary: string; wentWell: string; nextSteps: string }>> {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw)) return notFound("That report");
      const r = await store.reports.find(ps.clientId, `${monthRaw}-01`);
      if (!r || r.status !== "final") return notFound("That report");
      const facts = r.facts as ReportFacts;
      // Oppllo's internal note (hours, burn) never leaves Oppllo.
      return ok({ month: r.month, facts: { ...facts, internal: { minutesLogged: 0, burnPercent: null } }, summary: r.summary, wentWell: r.wentWell, nextSteps: r.nextSteps });
    },
  };
}
export type PortalService = ReturnType<typeof createPortalService>;
