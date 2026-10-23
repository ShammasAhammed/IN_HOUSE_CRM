import type { Metadata } from "next";
import Image from "next/image";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getServices } from "@/lib/server/container";
import { devLoginEnabled, googleEnabled } from "@/lib/server/auth";
import { ROLE_LABELS } from "@/lib/types";
import { signInAs, signInWithGoogle } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  NotInvited: "That Google account isn't on the Oppllo team list. Ask HR or the owner to add your email.",
  Unverified: "Google hasn't verified that email address. Use your verified work account.",
  AccessDenied: "That account can't sign in to Oppllo One.",
  CredentialsSignin: "That person can't sign in. They may have left or have no role yet.",
};

async function ErrorMessage({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { error } = await searchParams;
  const code = typeof error === "string" ? error : null;
  if (!code) return null;
  return (
    <p role="alert" className="mb-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-left text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {Object.hasOwn(ERRORS, code) ? ERRORS[code] : "Sign-in didn't work. Please try again."}
    </p>
  );
}

async function NextField({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const { next } = await searchParams;
  return <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />;
}

async function DevPeople({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  await connection(); // read the team list per request, never at build time
  const people = await getServices().identity.listSignInOptions();
  return (
    <ul className="divide-y rounded-lg border bg-card text-left">
      {people.map((p) => (
        <li key={p.id}>
          <form action={signInAs}>
            <Suspense fallback={null}>
              <NextField searchParams={searchParams} />
            </Suspense>
            <input type="hidden" name="email" value={p.workEmail} />
            <button type="submit" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover">
              <Avatar name={p.fullName} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.fullName}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.jobTitle}</span>
              </span>
              <span className="text-xs text-muted-foreground">{p.roles.map((r) => ROLE_LABELS[r]).join(", ")}</span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <Image src="/oppllo-logo.png" alt="Oppllo" width={130} height={44} className="mx-auto mb-6 h-auto w-[130px] dark:invert" priority />
        <div className="rounded-xl border bg-card p-6 shadow-pop">
          <h1 className="text-lg font-semibold tracking-tight">Sign in to Oppllo One</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Projects, people and clients in one place.</p>
          <Suspense fallback={null}>
            <ErrorMessage searchParams={searchParams} />
          </Suspense>
          {googleEnabled ? (
            <form action={signInWithGoogle}>
              <Suspense fallback={null}>
                <NextField searchParams={searchParams} />
              </Suspense>
              <Button type="submit" className="w-full" size="lg">
                <GoogleMark />
                Continue with Google
              </Button>
            </form>
          ) : (
            <p className="rounded-md bg-subtle px-3 py-2 text-xs text-muted-foreground">
              Google sign-in is not configured yet. Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to the environment.
            </p>
          )}
        </div>
        {devLoginEnabled ? (
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Development: sign in as</p>
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
              <DevPeople searchParams={searchParams} />
            </Suspense>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.72 14.56 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51z" />
    </svg>
  );
}
