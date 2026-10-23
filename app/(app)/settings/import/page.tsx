import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { ClickUpImport } from "./clickup-import";

export const metadata: Metadata = { title: "Import from ClickUp" };

export default function ImportPage() {
  return (
    <Suspense fallback={<LoadingRows rows={3} columns={2} label="Loading" />}>
      <Import />
    </Suspense>
  );
}

async function Import() {
  const actor = await requireActor();
  if (!can(actor, "settings.manage")) return <ErrorState error={{ code: "forbidden", message: "Only the owner imports from ClickUp." }} />;
  return <ClickUpImport />;
}
