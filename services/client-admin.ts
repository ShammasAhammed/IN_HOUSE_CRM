// Adding and editing clients, their contact people and their Oppllo team (clients.write: owner, strategist, BDO).
// GSTIN and billing address are contact details (D14): read and written only with clients.contacts.read.

import { isId, newId } from "@/lib/id";
import { forbidden, invalid, notFound, ok, type Result } from "@/lib/result";
import type { Role } from "@/lib/types";
import { clientSchema, addContactSchema, memberSchema, updateContactSchema } from "@/lib/validation/clients";
import { parse } from "@/lib/validation/common";
import { z } from "zod";
import type { ClientContactRecord, ClientWrite, DataStore, NewEvent, PersonRef, Repositories } from "@/repositories";
import { change, commit, noChange } from "./change";
import type { Clock } from "./clock";
import { can, clientScope, type Actor } from "./permissions";

export type ClientForm = {
  client: ClientWrite & { id: string };
  contacts: ClientContactRecord[];
  team: Array<{ personId: string; fullName: string }>;
  /** Active people who can lead a client. */
  leads: PersonRef[];
  /** Active people who can join the team. */
  people: PersonRef[];
  /** GSTIN, billing address and contact people. */
  contactDetails: boolean;
};

/** Who can be a client's lead strategist (D29). */
const LEAD_ROLES: readonly Role[] = ["strategist", "performance_marketer", "owner"];
/** Fields that are contact details (D14). */
const CONTACT_FIELDS = ["gstin", "billingAddress"] as const;

const DENIED = "Only the owner, strategists and the BDO change client records.";
const removeContactSchema = z.object({ contactId: z.uuid({ message: "Pick a contact." }) });

export function createClientAdminService(deps: { store: DataStore; clock: Clock }) {
  const { store, clock } = deps;

  const event = (actor: Actor, clientId: string, action: string, data: Record<string, unknown>, entity: { type: "client" | "client_contact"; id: string } = { type: "client", id: clientId }): NewEvent => ({
    actorId: actor.personId,
    action,
    entityType: entity.type,
    entityId: entity.id,
    clientId,
    data,
  });

  async function checkLead(repos: Repositories, leadId: string | null) {
    if (!leadId) return null;
    const lead = await repos.people.findById(leadId);
    if (!lead || lead.status !== "active" || !lead.roles.some((r) => LEAD_ROLES.includes(r))) {
      return invalid("Pick a strategist to lead this client.", { leadStrategistId: ["Pick a strategist."] });
    }
    return null;
  }

  async function writableClient(repos: Repositories, actor: Actor, clientId: string) {
    if (!isId(clientId)) return null;
    const client = await repos.clients.findById(clientId, clientScope(actor));
    // Spaces (Stage 14.1) are changed on the Spaces page, where only the owner and HR add members; never from here.
    return client && !client.isInternal ? client : null;
  }

  return {
    async form(actor: Actor, clientId?: string): Promise<Result<ClientForm>> {
      if (!can(actor, "clients.write")) return forbidden(DENIED);
      const contactDetails = can(actor, "clients.contacts.read");
      const everyone = await store.people.listActive();
      const leads = everyone.filter((p) => p.roles.some((r) => LEAD_ROLES.includes(r))).map((p) => ({ id: p.id, fullName: p.fullName }));
      const people = everyone.map((p) => ({ id: p.id, fullName: p.fullName }));
      if (!clientId) {
        return ok({
          client: { id: "", name: "", legalName: null, segment: "college", city: null, status: "onboarding", startDate: null, gstin: null, billingAddress: null, crmLeadId: null, leadStrategistId: null, notes: null, driveFolderUrl: null },
          contacts: [],
          team: [],
          leads,
          people,
          contactDetails,
        });
      }
      if (!(await writableClient(store, actor, clientId))) return notFound("That client");
      const [details, contacts, team] = await Promise.all([
        store.clients.findDetails(clientId),
        contactDetails ? store.clients.listContacts([clientId]) : Promise.resolve([]),
        store.clients.listMembers(clientId),
      ]);
      if (!details) return notFound("That client");
      const client = contactDetails ? details : { ...details, gstin: null, billingAddress: null };
      return ok({ client, contacts, team: team.map((m) => ({ personId: m.personId, fullName: m.fullName })), leads, people, contactDetails });
    },

    async create(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "clients.write")) return forbidden(DENIED);
      const parsed = parse(clientSchema, raw);
      if (!parsed.ok) return parsed;
      const input = can(actor, "clients.contacts.read") ? parsed.value : { ...parsed.value, gstin: null, billingAddress: null };
      return commit(store, async (repos) => {
        const taken = await repos.clients.findByName(input.name);
        if (taken) return invalid(`${taken.name} is already a client.`, { name: ["There's already a client with this name."] });
        const bad = await checkLead(repos, input.leadStrategistId);
        if (bad) return bad;
        const id = newId();
        await repos.clients.create(id, input);
        // The lead strategist is on the team from the start (D29).
        if (input.leadStrategistId) await repos.clients.addMember(id, input.leadStrategistId);
        return change({ id }, event(actor, id, "client.created", { name: input.name }));
      });
    },

    async update(actor: Actor, clientId: string, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "clients.write")) return forbidden(DENIED);
      const parsed = parse(clientSchema, raw);
      if (!parsed.ok) return parsed;
      const contactDetails = can(actor, "clients.contacts.read");
      return commit(store, async (repos) => {
        if (!(await writableClient(repos, actor, clientId))) return notFound("That client");
        const before = await repos.clients.findDetails(clientId);
        if (!before) return notFound("That client");
        const input: ClientWrite = contactDetails ? parsed.value : { ...parsed.value, gstin: before.gstin, billingAddress: before.billingAddress };
        const taken = await repos.clients.findByName(input.name, clientId);
        if (taken) return invalid(`${taken.name} is already a client.`, { name: ["There's already a client with this name."] });
        if (input.leadStrategistId !== before.leadStrategistId) {
          const bad = await checkLead(repos, input.leadStrategistId);
          if (bad) return bad;
        }
        const fields = (Object.keys(input) as Array<keyof ClientWrite>).filter((k) => input[k] !== before[k]);
        if (fields.length === 0) return noChange({ id: clientId });
        await repos.clients.update(clientId, input);
        if (input.leadStrategistId && input.leadStrategistId !== before.leadStrategistId) await repos.clients.addMember(clientId, input.leadStrategistId);

        // Values are left out of the history: contact details are restricted (D14) and the feed is widely seen.
        const isContactField = (f: string) => (CONTACT_FIELDS as readonly string[]).includes(f);
        const shown: string[] = fields.filter((f) => !isContactField(f));
        if (fields.some(isContactField)) shown.push("billing details");
        const events: [NewEvent, ...NewEvent[]] = [event(actor, clientId, "client.updated", { fields: shown })];
        if (input.status !== before.status) events.push(event(actor, clientId, "client.status_changed", { from: before.status, to: input.status }));
        return change({ id: clientId }, ...events);
      });
    },

    async addContact(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "clients.write") || !can(actor, "clients.contacts.read")) return forbidden(DENIED);
      const parsed = parse(addContactSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, ...contact } = parsed.value;
      return commit(store, async (repos) => {
        if (!(await writableClient(repos, actor, clientId))) return notFound("That client");
        const existing = await repos.clients.listContacts([clientId]);
        const id = newId();
        // The first contact is the primary one.
        const isPrimary = contact.isPrimary || existing.length === 0;
        await repos.clients.addContact(id, clientId, { ...contact, isPrimary });
        if (isPrimary) await repos.clients.clearPrimaryContact(clientId, id);
        return change({ id }, event(actor, clientId, "client.contact_added", { name: contact.name }, { type: "client_contact", id }));
      });
    },

    async updateContact(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "clients.write") || !can(actor, "clients.contacts.read")) return forbidden(DENIED);
      const parsed = parse(updateContactSchema, raw);
      if (!parsed.ok) return parsed;
      const { contactId, ...contact } = parsed.value;
      return commit(store, async (repos) => {
        const before = await repos.clients.findContact(contactId);
        if (!before || !(await writableClient(repos, actor, before.clientId))) return notFound("That contact");
        const fields = (Object.keys(contact) as Array<keyof typeof contact>).filter((k) => contact[k] !== before[k]);
        if (fields.length === 0) return noChange({ id: contactId });
        // Primary stays put unless another contact is made primary.
        const isPrimary = contact.isPrimary || before.isPrimary;
        await repos.clients.updateContact(contactId, { ...contact, isPrimary });
        if (contact.isPrimary && !before.isPrimary) await repos.clients.clearPrimaryContact(before.clientId, contactId);
        return change({ id: contactId }, event(actor, before.clientId, "client.contact_updated", { name: contact.name, fields }, { type: "client_contact", id: contactId }));
      });
    },

    async removeContact(actor: Actor, raw: unknown): Promise<Result<{ id: string }>> {
      if (!can(actor, "clients.write") || !can(actor, "clients.contacts.read")) return forbidden(DENIED);
      const parsed = parse(removeContactSchema, raw);
      if (!parsed.ok) return parsed;
      return commit(store, async (repos) => {
        const before = await repos.clients.findContact(parsed.value.contactId);
        if (!before || !(await writableClient(repos, actor, before.clientId))) return notFound("That contact");
        await repos.clients.updateContact(before.id, { deletedAt: clock.now(), isPrimary: false });
        // Someone else becomes primary so the client always has one when it has contacts.
        if (before.isPrimary) {
          const next = (await repos.clients.listContacts([before.clientId]))[0];
          if (next) await repos.clients.updateContact(next.id, { isPrimary: true });
        }
        return change({ id: before.id }, event(actor, before.clientId, "client.contact_removed", { name: before.name }, { type: "client_contact", id: before.id }));
      });
    },

    async addMember(actor: Actor, raw: unknown): Promise<Result<{ personId: string }>> {
      if (!can(actor, "clients.write")) return forbidden(DENIED);
      const parsed = parse(memberSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, personId } = parsed.value;
      return commit(store, async (repos) => {
        if (!(await writableClient(repos, actor, clientId))) return notFound("That client");
        const person = await repos.people.findById(personId);
        if (!person || person.status !== "active") return invalid("Pick someone on the Oppllo team.", { personId: ["Pick someone on the team."] });
        if ((await repos.clients.listMembers(clientId)).some((m) => m.personId === personId)) return noChange({ personId });
        await repos.clients.addMember(clientId, personId);
        return change({ personId }, event(actor, clientId, "client.member_added", { personId, name: person.fullName }));
      });
    },

    async removeMember(actor: Actor, raw: unknown): Promise<Result<{ personId: string }>> {
      if (!can(actor, "clients.write")) return forbidden(DENIED);
      const parsed = parse(memberSchema, raw);
      if (!parsed.ok) return parsed;
      const { clientId, personId } = parsed.value;
      return commit(store, async (repos) => {
        if (!(await writableClient(repos, actor, clientId))) return notFound("That client");
        const details = await repos.clients.findDetails(clientId);
        if (details?.leadStrategistId === personId) return invalid("They lead this client. Pick another lead first.");
        const member = (await repos.clients.listMembers(clientId)).find((m) => m.personId === personId);
        if (!member) return noChange({ personId });
        await repos.clients.removeMember(clientId, personId);
        return change({ personId }, event(actor, clientId, "client.member_removed", { personId, name: member.fullName }));
      });
    },
  };
}

export type ClientAdminService = ReturnType<typeof createClientAdminService>;
