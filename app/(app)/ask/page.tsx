import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Ask" };
// A question can take a few tool rounds; the default limit is too short for that.
export const maxDuration = 120;

export default function AskPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ask" description="Questions about clients, projects, tasks, hours and the team, in English or Malayalam. Answers come only from what you can see yourself." />
      <Suspense fallback={<LoadingRows rows={2} columns={1} label="Loading the assistant" />}>
        <Assistant />
      </Suspense>
    </div>
  );
}

async function Assistant() {
  const actor = await requireActor();
  const status = await getServices().assistant.status(actor);
  return <Chat blocked={status.reason} firstName={actor.fullName.split(" ")[0] ?? ""} />;
}
