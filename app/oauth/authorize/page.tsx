// The approval screen for AI apps (Stage 9.3, D87): the signed-in person lets an app act as them in Oppllo One.
import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";
import { knownAppHost } from "@/services/mcp-auth";
import { allowAction, denyAction } from "./actions";

export const metadata: Metadata = { title: "Connect an app" };

const FIELDS = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "resource"] as const;

export default function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 shadow-card">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Consent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      <AlertCircle className="mt-0.5 size-4 shrink-0" /> {message}
    </p>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  // Fixed messages only: nobody can put their own words on this page through the link.
  if (one("error")) return <Problem message="This connection request isn't valid any more. Start again from the app." />;

  const actor = await getActor();
  if (!actor) {
    const back = new URLSearchParams(FIELDS.flatMap((k) => (one(k) ? [[k, one(k)]] : [])));
    redirect(`/sign-in?next=${encodeURIComponent(`/oauth/authorize?${back}`)}` as Route);
  }
  if (one("response_type") && one("response_type") !== "code") return <Problem message="This app asked for a kind of sign-in Oppllo One doesn't support." />;
  const req = { clientId: one("client_id"), redirectUri: one("redirect_uri"), codeChallenge: one("code_challenge"), codeChallengeMethod: one("code_challenge_method"), state: one("state") || null, resource: one("resource") || null };
  const check = await getServices().mcpAuth.checkAuthorize(req);
  if (!check.ok) {
    if ("redirect" in check) redirect(check.redirect as Route);
    return <Problem message={check.show} />;
  }

  const hidden = FIELDS.map((k) => (one(k) ? <input key={k} type="hidden" name={k} value={one(k)} /> : null));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">Connect {check.client.name}?</h1>
      </div>
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-medium">{check.client.name}</span> wants to use Oppllo One as <span className="font-medium">{actor.fullName}</span>.
        </p>
        <p>
          Access goes to <span className="font-medium break-all">{new URL(req.redirectUri).host}</span>.
        </p>
        {knownAppHost(req.redirectUri) ? null : (
          <Problem message={`This isn't Claude's address. The name "${check.client.name}" is chosen by whoever set the app up. Only allow it if you started this yourself and trust ${new URL(req.redirectUri).host}.`} />
        )}
        <p className="text-muted-foreground">It will see what you can see, and can create tasks, change a task&apos;s status, comment and log time as you. Every action is recorded.</p>
        <p className="text-xs text-muted-foreground">You can disconnect it any time from My page.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={allowAction}>
          {hidden}
          <Button type="submit">Allow</Button>
        </form>
        <form action={denyAction}>
          {hidden}
          <Button type="submit" variant="outline">
            Cancel
          </Button>
        </form>
      </div>
    </div>
  );
}
