import "server-only";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Actor } from "@/services/permissions";
import type { PortalSession } from "@/services/portal";
import { auth } from "./auth";
import { getServices } from "./container";

const getSession = cache(async () => {
  // The session is per request; say so before Auth.js runs, so nothing is prerendered from it.
  await connection();
  return auth();
});

/** The signed-in person with fresh roles, once per request. Null when signed out, no longer active, or a client. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getSession();
  if (!session?.personId) return null;
  return getServices().identity.actorFor(session.personId);
});

/** For staff screens and actions: a client in the portal goes back to the portal, everyone else to sign in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (actor) return actor;
  if ((await getSession())?.portalUserId) redirect("/portal" as Route);
  redirect("/sign-in");
}

/** The client contact signed in to the portal (Stage 11.6), checked again on every request. */
export const getPortalUser = cache(async (): Promise<PortalSession | null> => {
  const session = await getSession();
  if (!session?.portalUserId) return null;
  return getServices().portal.session(session.portalUserId);
});

/** For portal screens: signed-out (or revoked) clients go to the portal's sign-in; terms come first. */
export async function requirePortalUser(opts: { allowUnagreed?: boolean } = {}): Promise<PortalSession> {
  const user = await getPortalUser();
  if (!user) redirect("/portal/sign-in" as Route);
  if (!user.agreed && !opts.allowUnagreed) redirect("/portal/welcome" as Route);
  return user;
}
