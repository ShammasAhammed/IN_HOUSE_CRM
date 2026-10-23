import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { EngagementForm } from "../../../../engagements/engagement-form";

export const metadata: Metadata = { title: "New engagement" };

export default function NewEngagementPage({ params }: PageProps<"/clients/[id]/engagements/new">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the form" />}>
      <NewEngagement params={params} />
    </Suspense>
  );
}

async function NewEngagement({ params }: Pick<PageProps<"/clients/[id]/engagements/new">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const form = await getServices().engagements.newForm(actor, id);
  if (!form.ok) return <ErrorState error={form.error} />;
  const { clientId, clientName, services } = form.value;
  return (
    <div className="space-y-5">
      <Link href={`/clients/${clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {clientName}
      </Link>
      <PageHeader title="New engagement" description={`A retainer or a one-off job for ${clientName}. Projects are started from it.`} />
      <EngagementForm
        initial={{ clientId, serviceId: "", kind: "retainer", name: "", status: "active", startDate: istDate(), endDate: "", renewalDate: "", hoursBudget: "", rolloverPolicy: "expire", notes: "" }}
        services={services}
        cancelHref={`/clients/${clientId}` as Route}
      />
    </div>
  );
}
