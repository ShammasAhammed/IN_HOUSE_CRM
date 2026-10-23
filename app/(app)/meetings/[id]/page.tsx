// A meeting's link (Stage 13.4): opens its page, for whoever can see it.
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";

export default function MeetingRoute({ params }: PageProps<"/meetings/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={1} label="Opening the meeting" />}>
      <Meeting params={params} />
    </Suspense>
  );
}

async function Meeting({ params }: Pick<PageProps<"/meetings/[id]">, "params">) {
  const r = await getServices().meetings.get(await requireActor(), (await params).id);
  if (!r.ok) return <ErrorState error={r.error} />;
  redirect(`/docs/${r.value.docId}` as Route);
}
