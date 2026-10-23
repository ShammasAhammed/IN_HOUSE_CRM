import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import leads" };

export default function ImportPage() {
  return (
    <Suspense fallback={<LoadingRows rows={3} columns={2} label="Loading" />}>
      <Importer />
    </Suspense>
  );
}

async function Importer() {
  const actor = await requireActor();
  const services = getServices();
  const mirror = await services.leads.mirror(actor);
  if (!mirror.ok) return <ErrorState error={mirror.error} />;
  if (!mirror.value.canEdit) {
    return <ErrorState error={{ code: "forbidden", message: mirror.value.live ? "Only the BDO and the owner import leads." : "Sales is still worked in the CRM until switch day. Import there for now." }} />;
  }
  const dir = await services.people.directory(actor);
  const people = dir.ok ? dir.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, fullName: p.fullName })) : [];
  return <ImportWizard people={people} />;
}
