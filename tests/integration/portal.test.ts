// The client portal (Stage 11.6): a client contact sees only their own client (two clients, a private space and an
// internal space exist alongside), never staff comments, hours or fees; approves creatives as themselves; sends
// requests that become tasks; and loses access at once when revoked or removed.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { newId } from "@/lib/id";
import type { Mailer } from "@/repositories";
import { createIdentityService } from "@/services/identity";
import { createPortalService, type PortalSession } from "@/services/portal";
import { actorOf, addClient, addPerson, addProjectWithTask, addRetainer, addService, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, {
  signLink: ({ fileId }, expiresAt, name, viewerId) => `/api/files/${fileId}?exp=${expiresAt.getTime()}&name=${name}&viewer=${viewerId}`,
});
const clock = fixedClock("2026-10-21");
const sent: Array<{ to: string; text: string }> = [];
const mailer: Mailer = { send: async (m) => void sent.push(m) };
const make = (emailReady: boolean) => createPortalService({ store, clock, storage, mailer, emailReady, appUrl: "https://one.example", logLinks: false });
const portal = make(false);
const identity = createIdentityService({ store });

const ids = { owner: "", strategist: "", designer: "", zenith: "", alpha: "", founder: "", ops: "", zenithContact: "", alphaContact: "", zenithAsset: "", alphaAsset: "", spaceAsset: "", zenithVersion: "" };
const strategist = () => actorOf(ids.strategist, ["strategist"]);
const tokenOf = (link: string | null) => link!.split("/").at(-1)!;

async function asset(clientId: string, title: string, state: "client_review" | "approved" = "client_review") {
  const id = newId();
  const versionId = newId();
  await db.insert(s.assets).values({ id, clientId, title, kind: "image", approvalState: state, currentVersion: 1, createdById: ids.designer });
  await db.insert(s.assetVersions).values({ id: versionId, assetId: id, version: 1, storageProvider: "postgres", storageLocation: "x", storageFileId: newId(), fileName: `${title}.png`, uploadedById: ids.designer });
  await db.insert(s.assetComments).values({ id: newId(), assetId: id, versionId, authorId: ids.strategist, body: "Internal: the logo is a bit small, margin is thin" });
  return { id, versionId };
}

async function signedInZenith(): Promise<PortalSession> {
  const inv = await portal.invite(strategist(), { clientId: ids.zenith, contactId: ids.zenithContact });
  if (!inv.ok) throw new Error(inv.error.message);
  const id = await portal.redeem(tokenOf(inv.value.link));
  const ps = await portal.session(id!);
  await portal.agree(ps!);
  return (await portal.session(id!))!;
}

beforeEach(async () => {
  await wipe(db);
  sent.length = 0;
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.strategist = await addPerson(db, "Anjali Nair", ["strategist"]);
  ids.designer = await addPerson(db, "Nikhil Das", ["designer"]);
  ids.zenith = await addClient(db, "Zenith IAS Academy", { strategistId: ids.strategist });
  ids.alpha = await addClient(db, "Alpha Nursing College", { strategistId: ids.strategist });
  ids.founder = newId();
  ids.ops = newId();
  await db.insert(s.clients).values([
    { id: ids.founder, name: "Founder office", isInternal: true, isPrivate: true, status: "active" },
    { id: ids.ops, name: "Operations", isInternal: true, status: "active" },
  ]);
  const contacts = await db.select({ id: s.clientContacts.id, clientId: s.clientContacts.clientId }).from(s.clientContacts);
  ids.zenithContact = contacts.find((c) => c.clientId === ids.zenith)!.id;
  ids.alphaContact = contacts.find((c) => c.clientId === ids.alpha)!.id;
  await db.execute(sql`update client_contacts set email = 'principal@zenith.example' where id = ${ids.zenithContact}`);
  await db.execute(sql`update client_contacts set email = 'dean@alpha.example' where id = ${ids.alphaContact}`);
  const z = await asset(ids.zenith, "Open day poster");
  ids.zenithAsset = z.id;
  ids.zenithVersion = z.versionId;
  ids.alphaAsset = (await asset(ids.alpha, "Alpha admissions reel")).id;
  ids.spaceAsset = (await asset(ids.founder, "Founder pitch deck")).id;
  const service = await addService(db);
  const retainer = await addRetainer(db, ids.zenith, service, { feePaise: 9_900_000, budgetMinutes: 2400, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  await addProjectWithTask(db, ids.zenith, { engagementId: retainer, ownerId: ids.designer, loggedMinutes: 600, workDate: "2026-10-05" });
  await db.execute(sql`update tasks set rank = 'a0'`);
  await db.insert(s.clientResults).values({ id: newId(), clientId: ids.zenith, month: "2026-10-01", leads: 120, spendPaise: 4_500_000, admissions: 6, targetLeads: 150, updatedById: ids.strategist });
  for (const [clientId, status] of [[ids.zenith, "final"], [ids.alpha, "final"]] as const) {
    await db.insert(s.clientReports).values({ id: newId(), clientId, month: "2026-09-01", status, facts: { month: "2026-09-01", clientName: "x", results: null, ads: null, deliverables: [], tasksDone: { count: 3, titles: [] }, creativesApproved: 1, postsPublished: 2, internal: { minutesLogged: 4321, burnPercent: 140 }, gatheredAt: "2026-10-01T00:00:00Z" }, summary: "A good month.", createdById: ids.strategist, finalizedById: ids.strategist, finalizedAt: new Date() });
  }
});

afterAll(async () => {
  await store.close();
  await client.end();
  await storage.close();
});

describe("inviting and signing in", () => {
  it("is for the owner and strategists, by the contact's email; without email sending the inviter gets the link", async () => {
    const no = await portal.invite(actorOf(ids.designer, ["designer"]), { clientId: ids.zenith, contactId: ids.zenithContact });
    expect(no.ok ? "ok" : no.error.code).toBe("forbidden");
    const inv = await portal.invite(strategist(), { clientId: ids.zenith, contactId: ids.zenithContact });
    expect(inv.ok && inv.value.emailSent).toBe(false);
    expect(inv.ok && inv.value.link).toMatch(/^https:\/\/one\.example\/portal\/link\/[\w-]{40,}$/);
    const twice = await portal.invite(strategist(), { clientId: ids.zenith, contactId: ids.zenithContact });
    expect(twice.ok ? "ok" : twice.error.code).toBe("conflict");
    // Oppllo's own spaces have no portal.
    expect((await portal.invite(actorOf(ids.owner, ["owner"]), { clientId: ids.ops, contactId: ids.zenithContact })).ok).toBe(false);
    // With email set up, the link goes by email and isn't shown.
    const withMail = await make(true).invite(strategist(), { clientId: ids.alpha, contactId: ids.alphaContact });
    expect(withMail.ok && withMail.value).toEqual({ emailSent: true, link: null });
    expect(sent[0]?.to).toBe("dean@alpha.example");
  });

  it("uses each link once, never says who is invited, and records consent to the terms before anything shows", async () => {
    const inv = await portal.invite(strategist(), { clientId: ids.zenith, contactId: ids.zenithContact });
    const token = tokenOf(inv.ok ? inv.value.link : null);
    const id = await portal.redeem(token);
    expect(id).toBeTruthy();
    expect(await portal.redeem(token)).toBeNull();
    expect(await portal.redeem("not-a-real-token-at-all-0000000")).toBeNull();
    expect(await createPortalService({ store, clock, storage, mailer, emailReady: false, appUrl: "x", logLinks: true }).requestLink("nobody@nowhere.example")).toEqual({ devLink: null });
    const ps = await portal.session(id!);
    expect(ps).toMatchObject({ clientId: ids.zenith, name: "Zenith IAS Academy Director", agreed: false });
    expect((await portal.agree(ps!)).ok).toBe(true);
    expect((await portal.session(id!))?.agreed).toBe(true);
    const [consent] = await db.execute<{ subject_type: string; method: string }>(sql`select subject_type, method from consent_records`);
    expect(consent).toEqual({ subject_type: "client_contact", method: "form" });
    expect((await eventsFor(db, id!)).map((e) => e.action)).toEqual(["portal.invited", "portal.signed_in"]);
    // A portal user is not a person: no staff actor can come from their id.
    expect(await identity.actorFor(id!)).toBeNull();
  });
});

describe("only their own client", () => {
  it("sees its own creatives waiting, never staff comments, other clients' or spaces' work, hours or fees", async () => {
    const ps = await signedInZenith();
    const list = await portal.creatives(ps);
    expect(list.map((c) => c.title)).toEqual(["Open day poster"]);
    expect(list[0]!.comments).toEqual([]);
    expect(list[0]!.url).toContain(`viewer=portal:${ps.id}`);
    const home = await portal.home(ps);
    expect(home).toMatchObject({ clientName: "Zenith IAS Academy", results: { leads: 120, admissions: 6, targetLeads: 150, costPerLeadPaise: 37_500 }, waiting: 1 });
    const text = JSON.stringify(home);
    expect(text).not.toMatch(/fee|minutes|burn|budget|9900000|Alpha|Founder/i);
    for (const assetId of [ids.alphaAsset, ids.spaceAsset]) {
      const r = await portal.decide(ps, { assetId, versionId: ids.zenithVersion, decision: "approve" });
      expect(r.ok ? "ok" : r.error.code).toBe("not_found");
    }
    expect((await portal.comment(ps, { assetId: ids.alphaAsset, versionId: ids.zenithVersion, body: "Hi" })).ok).toBe(false);
    const report = await portal.report(ps, "2026-09");
    expect(report.ok && report.value.facts.internal).toEqual({ minutesLogged: 0, burnPercent: null });
    expect(await portal.reports(ps)).toEqual(["2026-09-01"]);
  });
});

describe("approving and requesting", () => {
  it("records the client's own decision, needs a note for changes, and tells the makers", async () => {
    const ps = await signedInZenith();
    const noNote = await portal.decide(ps, { assetId: ids.zenithAsset, versionId: ids.zenithVersion, decision: "changes" });
    expect(noNote.ok ? null : noNote.error.fieldErrors?.note).toBeTruthy();
    expect((await portal.comment(ps, { assetId: ids.zenithAsset, versionId: ids.zenithVersion, body: "Can the date be bigger?" })).ok).toBe(true);
    expect((await portal.creatives(ps))[0]!.comments.map((c) => [c.by, c.body])).toEqual([["Zenith IAS Academy Director (client)", "Can the date be bigger?"]]);
    expect(await portal.decide(ps, { assetId: ids.zenithAsset, versionId: ids.zenithVersion, decision: "approve", note: "Looks great" })).toEqual({ ok: true, value: { state: "approved" } });
    const [row] = await db.select().from(s.assets).where(sql`${s.assets.id} = ${ids.zenithAsset}`);
    expect(row).toMatchObject({ approvalState: "approved", approvedById: null, approvedVersionId: ids.zenithVersion });
    const comments = await store.assets.listComments(ids.zenithAsset);
    expect(comments.at(-1)).toMatchObject({ action: "client_approved", portalUserId: ps.id, authorId: null, body: "Looks great" });
    const [ev] = await db.execute<{ actor_id: string | null; data: { byClient: boolean; by: string } }>(sql`select actor_id, data from events where action = 'asset.client_approved'`);
    expect(ev).toMatchObject({ actor_id: null, data: { byClient: true, by: "Zenith IAS Academy Director" } });
    expect(await portal.creatives(ps)).toEqual([]);
  });

  it("turns a request into a task for the lead strategist, tagged Request", async () => {
    const ps = await signedInZenith();
    const r = await portal.request(ps, { title: "Poster for the scholarship test", details: "Test on 2 Nov", neededBy: "2026-10-28" });
    expect(r.ok).toBe(true);
    const [t] = await db.select().from(s.tasks).where(sql`${s.tasks.id} = ${r.ok ? r.value.taskId : ""}`);
    expect(t).toMatchObject({ clientId: ids.zenith, ownerId: ids.strategist, tags: ["Request"], dueDate: "2026-10-28", createdById: null });
    expect(t!.description).toContain("Sent by Zenith IAS Academy Director through the client portal.");
    const notes = await db.execute<{ person_id: string }>(sql`select person_id from notifications where kind = 'task.assigned'`);
    expect(notes.map((n) => n.person_id)).toEqual([ids.strategist]);
  });
});

describe("closing access", () => {
  it("revoking, removing the contact or changing their email ends the session at once", async () => {
    const ps = await signedInZenith();
    const invites = await portal.invites(strategist(), ids.zenith);
    const invite = invites.ok ? invites.value.contacts.find((c) => c.contactId === ids.zenithContact)!.invite! : null;
    expect(invite?.status).toBe("active");
    expect((await portal.revoke(strategist(), { portalUserId: invite!.id })).ok).toBe(true);
    expect(await portal.session(ps.id)).toBeNull();

    const again = await portal.invite(strategist(), { clientId: ids.zenith, contactId: ids.zenithContact });
    const id = await portal.redeem(tokenOf(again.ok ? again.value.link : null));
    expect(await portal.session(id!)).not.toBeNull();
    await db.execute(sql`update client_contacts set email = 'new@zenith.example' where id = ${ids.zenithContact}`);
    expect(await portal.session(id!)).toBeNull();
    await db.execute(sql`update client_contacts set email = 'principal@zenith.example' where id = ${ids.zenithContact}`);
    await db.execute(sql`update client_contacts set deleted_at = now() where id = ${ids.zenithContact}`);
    expect(await portal.session(id!)).toBeNull();
    expect(await portal.google("principal@zenith.example")).toBeNull();
  });
});
