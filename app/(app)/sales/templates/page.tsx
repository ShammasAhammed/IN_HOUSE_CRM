import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { TemplatesForm } from "../sales-extras";

export const metadata: Metadata = { title: "Message templates" };

export default function TemplatesPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading templates" />}>
      <Templates />
    </Suspense>
  );
}

async function Templates() {
  const actor = await requireActor();
  const r = await getServices().leads.templates(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (!r.value.canEdit) return <ErrorState error={{ code: "forbidden", message: "Only the BDO and the owner change message templates." }} />;
  return (
    <div className="max-w-3xl">
      <TemplatesForm templates={r.value.templates} />
    </div>
  );
}
