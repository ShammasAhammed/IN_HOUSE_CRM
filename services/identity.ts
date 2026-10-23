// Who is signed in. Sign-in is allowed only for an email that matches an active person (decision D3).

import type { DataStore, PersonRecord } from "@/repositories";
import { capabilitiesFor, type Actor } from "./permissions";

export function toActor(person: PersonRecord): Actor {
  return {
    personId: person.id,
    fullName: person.fullName,
    email: person.workEmail,
    roles: person.roles,
    employmentType: person.employmentType,
    capabilities: capabilitiesFor(person.roles),
  };
}

export type SignInDecision = { allow: true; personId: string } | { allow: false; reason: "Unverified" | "NotInvited" | "Refused" };

/**
 * The whole sign-in policy in one pure function (decision D3):
 * - Google: the email must be verified by Google and belong to an active person with a role.
 * - Dev: only when the development login is enabled, and only for an active person with a role.
 */
export function decideSignIn(input: {
  provider: string | undefined;
  emailVerified: boolean;
  devLoginEnabled: boolean;
  person: PersonRecord | null;
}): SignInDecision {
  const eligible = input.person && input.person.status === "active" && input.person.roles.length > 0 ? input.person : null;
  if (input.provider === "google") {
    if (!input.emailVerified) return { allow: false, reason: "Unverified" };
    return eligible ? { allow: true, personId: eligible.id } : { allow: false, reason: "NotInvited" };
  }
  if (input.provider === "dev" && input.devLoginEnabled && eligible) return { allow: true, personId: eligible.id };
  return { allow: false, reason: "Refused" };
}

/** The development "sign in as" list exists only outside production and only when switched on. */
export function devLoginAllowed(env: { AUTH_DEV_LOGIN?: string; NODE_ENV?: string }): boolean {
  return env.AUTH_DEV_LOGIN === "1" && env.NODE_ENV !== "production";
}

export function createIdentityService(deps: { store: DataStore }) {
  const { store } = deps;

  return {
    /** The person behind a sign-in email (any status — decideSignIn judges), or null. */
    async findByEmail(email: string): Promise<PersonRecord | null> {
      return store.people.findByEmail(email.trim());
    },

    /** The active person with a role behind an email, or null to refuse sign-in. */
    async personForSignIn(email: string): Promise<PersonRecord | null> {
      const person = await store.people.findByEmail(email.trim());
      return person && person.status === "active" && person.roles.length > 0 ? person : null;
    },

    /** Rebuilt on every request, so a role change or a leaver takes effect immediately. */
    async actorFor(personId: string): Promise<Actor | null> {
      const person = await store.people.findById(personId);
      return person && person.status === "active" && person.roles.length > 0 ? toActor(person) : null;
    },

    /** For the development-only "sign in as" list. */
    async listSignInOptions(): Promise<Array<Pick<PersonRecord, "id" | "fullName" | "workEmail" | "jobTitle" | "roles">>> {
      const people = await store.people.listActive();
      return people.map(({ id, fullName, workEmail, jobTitle, roles }) => ({ id, fullName, workEmail, jobTitle, roles }));
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
