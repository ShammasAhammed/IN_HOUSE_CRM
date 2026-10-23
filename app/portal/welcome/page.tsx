import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { requirePortalUser } from "@/lib/server/session";
import { PORTAL_TERMS } from "@/services/portal";
import { agreeAction } from "../actions";

export const metadata: Metadata = { title: "Welcome", robots: { index: false, follow: false } };

async function Terms() {
  const user = await requirePortalUser({ allowUnagreed: true });
  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{user.clientName}</p>
      <div className="my-4 space-y-2 rounded-md bg-subtle px-3 py-3 text-sm">
        <p>{PORTAL_TERMS}</p>
        <p>You see only {user.clientName}&apos;s work. Your sign-ins and decisions are recorded. You can stop using the portal at any time by asking your Oppllo contact to remove your access.</p>
      </div>
      <form action={agreeAction}>
        <Button type="submit" className="w-full">
          I agree
        </Button>
      </form>
    </>
  );
}

/** DPDP (11.7): the contact agrees before anything shows; the agreement is kept as their consent record. */
export default function WelcomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-sm">
        <Image src="/oppllo-logo.png" alt="Oppllo" width={130} height={44} className="mx-auto mb-6 h-auto w-[130px] dark:invert" priority />
        <div className="rounded-xl border bg-card p-6 shadow-pop">
          <Suspense fallback={null}>
            <Terms />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
