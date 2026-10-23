// Letter templates (HR slice 3): HR words them once; each letter fills in the person's details.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LetterTemplatesForm } from "../talent-forms";

export const metadata: Metadata = { title: "Letter templates" };

export default function LettersPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <BackLink fallback="/people" />
      <PageHeader title="Letter templates" description="Offer, internship certificate, experience and relieving letters. Issue one from a person's profile." />
      <Suspense fallback={<LoadingRows rows={6} columns={1} label="Loading" />}>
        <Templates />
      </Suspense>
    </div>
  );
}

async function Templates() {
  const actor = await requireActor();
  const r = await getServices().talent.letterTemplates(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  return <LetterTemplatesForm templates={r.value} />;
}
