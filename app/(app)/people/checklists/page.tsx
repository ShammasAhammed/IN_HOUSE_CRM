import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Checklists" };

export default function ChecklistsPage() {
  return (
    <div className="space-y-4">
      <BackLink fallback="/people" label="People" />
      <PageHeader
        title="Joining and exit checklists"
        description="The steps every new person and every leaver goes through. Exit checklists also list each open access, client and task from Oppllo One by themselves."
      />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading checklists" />}>
        <Templates />
      </Suspense>
    </div>
  );
}

async function Templates() {
  const actor = await requireActor();
  const r = await getServices().access.templates(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <TemplateForm kind="joining" items={r.value.joining} />
      <TemplateForm kind="exit" items={r.value.exit} />
    </div>
  );
}
