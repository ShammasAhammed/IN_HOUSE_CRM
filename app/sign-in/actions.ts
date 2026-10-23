"use server";

import { devLoginEnabled, signIn } from "@/lib/server/auth";

/** Only same-site paths, so a crafted link cannot send someone elsewhere after sign-in. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: safeNext(formData.get("next")) });
}

export async function signInAs(formData: FormData) {
  if (!devLoginEnabled) return;
  await signIn("dev", { email: String(formData.get("email") ?? ""), redirectTo: safeNext(formData.get("next")) });
}
