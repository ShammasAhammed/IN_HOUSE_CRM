"use server";

// The public request form (Stage 9b.5): no sign-in; the service checks the link, a hidden bot field and a daily cap.
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { formToObject, toActionState, type ActionState } from "@/lib/action-state";
import { getServices } from "@/lib/server/container";

export async function submitPublicRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const values = formToObject(form);
  // Where it came from, one-way hashed (never stored as an address), to limit one sender's requests.
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0]!.trim();
  const key = ip ? createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("base64url").slice(0, 32) : null;
  const r = await getServices().requestForms.submitPublic(String(values.slug ?? ""), values, key);
  if (!r.ok) return toActionState(r, "", values);
  return toActionState(r, "Thank you. We've received your request and will get back to you.");
}
