"use server";

import { signOut } from "@/lib/server/auth";

export async function signOutAction() {
  await signOut({ redirectTo: "/sign-in" });
}
