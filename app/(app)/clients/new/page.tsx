import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Add client" };

export default function NewClientPage({ searchParams }: PageProps<"/clients/new">) {
  return (
    <>
      <PageHeader title="Add a client" description="Contacts, the team and engagements come next, on the client's page." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the form" />}>
        <NewClient searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewClient({ searchParams }: Pick<PageProps<"/clients/new">, "searchParams">) {
  const actor = await requireActor();
  const { lead } = await searchParams;
  const services = getServices();
  const [form, fromLead] = await Promise.all([services.clientAdmin.form(actor), typeof lead === "string" ? services.crm.prefill(actor, lead) : Promise.resolve(null)]);
  if (!form.ok) return <ErrorState error={form.error} />;
  if (fromLead && !fromLead.ok) return <ErrorState error={fromLead.error} />;
  const c = form.value.client;
  const l = fromLead?.value;
  return (
    <ClientForm
      initial={{ name: l?.name ?? "", legalName: "", segment: l?.segment ?? c.segment, status: c.status, city: "", startDate: "", leadStrategistId: "", gstin: "", billingAddress: "", crmLeadId: l?.crmLeadId ?? "", notes: l?.notes ?? "", driveFolderUrl: "" }}
      leads={form.value.leads}
      contactDetails={form.value.contactDetails}
      cancelHref="/clients"
    />
  );
}
