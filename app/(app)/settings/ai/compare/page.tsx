// Compare models (Stage 12.3, owner only): the same examples on two or three models side by side, with what each
// answer cost, then "use this model first" for a feature. Every run is logged as "compare" inside the AI limit.
import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { Compare } from "./compare";

export const metadata: Metadata = { title: "Compare AI models" };

export default function ComparePage() {
  return (
    <div className="max-w-6xl space-y-4">
      <BackLink fallback="/settings/ai" label="AI settings" />
      <Suspense fallback={<LoadingRows rows={4} columns={3} label="Loading models" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  const actor = await requireActor();
  const services = getServices();
  const [router, tasks] = await Promise.all([services.ai.router(actor), services.tasks.table(actor, {})]);
  if (!router.ok) return <ErrorState error={router.error} />;
  // Recent real work the owner can see, as examples: task titles with their client.
  const briefs = tasks.ok ? tasks.value.tasks.slice(0, 10).map((t) => `${t.title} (for ${t.clientName})`) : [];
  return <Compare models={router.value.models.map((m) => ({ model: m.model, provider: m.provider }))} briefs={briefs} />;
}
