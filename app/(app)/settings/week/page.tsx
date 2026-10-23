import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { WorkWeekForm } from "../service-forms";

export const metadata: Metadata = { title: "Working week" };

export default function WorkWeekPage() {
  return (
    <Suspense fallback={<LoadingRows rows={3} columns={2} label="Loading the working week" />}>
      <WorkWeek />
    </Suspense>
  );
}

async function WorkWeek() {
  const actor = await requireActor();
  const result = await getServices().leave.workWeek(actor);
  if (!result.ok) return <ErrorState error={result.error} />;
  return <WorkWeekForm week={result.value} />;
}
