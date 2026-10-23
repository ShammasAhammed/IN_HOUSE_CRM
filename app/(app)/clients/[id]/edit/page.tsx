import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ClientForm } from "../../client-form";
import { ContactsEditor, TeamEditor } from "./client-extras";

export const metadata: Metadata = { title: "Edit client" };

export default function EditClientPage({ params, searchParams }: PageProps<"/clients/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the client" />}>
      <EditClient params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditClient({ params, searchParams }: Pick<PageProps<"/clients/[id]/edit">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const form = await getServices().clientAdmin.form(actor, id);
  if (!form.ok) return <ErrorState error={form.error} />;
  const { client: c, contacts, team, people, leads, contactDetails } = form.value;
  const s = (v: string | null) => v ?? "";

  return (
    <div className="space-y-6">
      <Link href={`/clients/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {c.name}
      </Link>
      <PageHeader title={`Edit ${c.name}`} />
      {query.done === "created" ? <SuccessNotice>Client added. Add their contact people and the Oppllo team here.</SuccessNotice> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ClientForm
          initial={{
            clientId: c.id,
            name: c.name,
            legalName: s(c.legalName),
            segment: c.segment,
            status: c.status,
            city: s(c.city),
            startDate: s(c.startDate),
            leadStrategistId: s(c.leadStrategistId),
            gstin: s(c.gstin),
            billingAddress: s(c.billingAddress),
            crmLeadId: s(c.crmLeadId),
            notes: s(c.notes),
            driveFolderUrl: s(c.driveFolderUrl),
          }}
          leads={leads}
          contactDetails={contactDetails}
          cancelHref={`/clients/${c.id}` as Route}
        />
        <div className="space-y-6">
          {contactDetails ? <ContactsEditor clientId={c.id} contacts={contacts} /> : null}
          <TeamEditor clientId={c.id} team={team} people={people} leadId={c.leadStrategistId} />
        </div>
      </div>
    </div>
  );
}
