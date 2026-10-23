import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { googleEnabled } from "@/lib/server/auth";
import { googleAction } from "../../actions";
import { EmailLinkForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Client sign-in", robots: { index: false, follow: false } };

async function Expired({ searchParams }: { searchParams: PageProps<"/portal/sign-in">["searchParams"] }) {
  const q = await searchParams;
  return q.expired ? <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">That link has been used or has expired. Ask for a new one below.</p> : null;
}

export default function PortalSignInPage({ searchParams }: PageProps<"/portal/sign-in">) {
  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">Your work with Oppllo</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">Results, creatives to approve, requests and monthly reports. For the people Oppllo invited.</p>
      <Suspense fallback={null}>
        <Expired searchParams={searchParams} />
      </Suspense>
      <EmailLinkForm />
      {googleEnabled ? (
        <form action={googleAction} className="mt-4 border-t pt-4">
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>
      ) : null}
    </>
  );
}
