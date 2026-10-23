import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { NewServiceForm, ServiceCard } from "./service-forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={3} label="Loading services" />}>
      <Services />
    </Suspense>
  );
}

async function Services() {
  const actor = await requireActor();
  const result = await getServices().catalog.overview(actor);
  if (!result.ok) return <ErrorState error={result.error} />;
  const services = result.value;
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Each service has default stages and starter tasks. A new project copies them, so changes here apply to projects started from now on. Retired services
        can&apos;t be picked for new engagements; existing ones keep them.
      </p>
      {/* Above the list: a new service appears below the form, so its Move up arrow never lands under the cursor (QA S9-17). */}
      <NewServiceForm />
      {services.map((s, i) => (
        <ServiceCard key={s.id} service={s} first={i === 0} last={i === services.length - 1} />
      ))}
    </div>
  );
}
