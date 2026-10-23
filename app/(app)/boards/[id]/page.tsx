// One Idea Board (Stage 13.1). The canvas loads in the browser only; the page sends the scene and everything around it.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { BoardRoom } from "./board-room";

export const metadata: Metadata = { title: "Idea board" };

export default function BoardPage({ params, searchParams }: PageProps<"/boards/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={3} label="Opening the board" />}>
      <Board params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Board({ params, searchParams }: Pick<PageProps<"/boards/[id]">, "params" | "searchParams">) {
  const [actor, { id }, sp] = await Promise.all([requireActor(), params, searchParams]);
  const r = await getServices().boards.open(actor, id);
  if (!r.ok) return <ErrorState error={r.error} />;
  const on = typeof sp.on === "string" ? sp.on : null;
  return <BoardRoom page={r.value} focus={on} />;
}
