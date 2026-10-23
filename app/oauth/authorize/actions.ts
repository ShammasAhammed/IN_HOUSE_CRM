"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { AuthorizeRequest } from "@/services/mcp-auth";

function requestFrom(form: FormData): AuthorizeRequest {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v ? v : null;
  };
  return { clientId: get("client_id") ?? "", redirectUri: get("redirect_uri") ?? "", codeChallenge: get("code_challenge") ?? "", codeChallengeMethod: get("code_challenge_method") ?? "", state: get("state"), resource: get("resource") };
}

export async function allowAction(form: FormData) {
  const actor = await requireActor();
  const r = await getServices().mcpAuth.approve(actor, requestFrom(form));
  if (!r.ok) redirect("/oauth/authorize?error=invalid" as Route);
  redirect(r.value.redirect as Route);
}

export async function denyAction(form: FormData) {
  await requireActor();
  const req = requestFrom(form);
  const check = await getServices().mcpAuth.checkAuthorize(req);
  if (!check.ok) redirect("/");
  const url = new URL(req.redirectUri);
  url.searchParams.set("error", "access_denied");
  if (req.state) url.searchParams.set("state", req.state);
  redirect(url.toString() as Route);
}
