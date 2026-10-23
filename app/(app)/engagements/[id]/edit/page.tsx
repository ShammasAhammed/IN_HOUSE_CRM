import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { EngagementForm } from "../../engagement-form";

export const metadata: Metadata = { title: "Edit engagement" };

export default function EditEngagementPage({ params }: PageProps<"/engagements/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the engagement" />}>
      <EditEngagement params={params} />
    </Suspense>
  );
}

async function EditEngagement({ params }: Pick<PageProps<"/engagements/[id]/edit">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const page = await getServices().engagements.page(actor, id);
  if (!page.ok) return <ErrorState error={page.error} />;
  const { engagement: e, services, visible } = page.value;
  if (!visible.write || !services) return <ErrorState error={{ code: "forbidden", message: "Only the owner and the BDO change engagements." }} />;
  const hours = e.hoursBudgetMinutes ? String(e.hoursBudgetMinutes / 60) : "";
  return (
    <div className="space-y-5">
      <Link href={`/engagements/${e.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {e.name}
      </Link>
      <PageHeader title="Edit engagement" description={`${e.clientName} · fees are changed on the engagement page, so their history is kept.`} />
      <EngagementForm
        initial={{
          engagementId: e.id,
          serviceId: e.serviceId,
          kind: e.kind,
          name: e.name,
          status: e.status,
          startDate: e.startDate,
          endDate: e.endDate ?? "",
          renewalDate: e.renewalDate ?? "",
          hoursBudget: hours,
          rolloverPolicy: e.rolloverPolicy,
          notes: e.notes ?? "",
        }}
        services={services}
        cancelHref={`/engagements/${e.id}` as Route}
      />
    </div>
  );
}
