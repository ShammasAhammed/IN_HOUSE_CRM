import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { linkSignInAction } from "../../../actions";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function LinkForm({ params }: { params: PageProps<"/portal/link/[token]">["params"] }) {
  const { token } = await params;
  return (
    <form action={linkSignInAction}>
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="w-full" size="lg">
        Sign in
      </Button>
    </form>
  );
}

/** Opening the link changes nothing (email checkers open links too); pressing the button signs in. */
export default function PortalLinkPage({ params }: PageProps<"/portal/link/[token]">) {
  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">Sign in to your Oppllo portal</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">This link works once.</p>
      <Suspense fallback={null}>
        <LinkForm params={params} />
      </Suspense>
    </>
  );
}
