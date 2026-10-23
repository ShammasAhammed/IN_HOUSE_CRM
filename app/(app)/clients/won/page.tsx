import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Trophy } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ConfirmForm } from "@/components/confirm-form";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { dismissLeadAction, syncLeadsAction } from "./actions";

export const metadata: Metadata = { title: "Won in the CRM" };

export default function WonLeadsPage() {
  return (
    <div className="space-y-4">
      <BackLink fallback="/clients" label="Clients" />
      <PageHeader title="Won in the CRM" description="Leads marked won in the prospect CRM. Set each up as a client (fee and hours come with its engagement), or take it off the list." />
      <Suspense fallback={<LoadingRows rows={5} columns={3} label="Loading won leads" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const actor = await requireActor();
  const r = await getServices().crm.inbox(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (!r.value.connected) {
    return <EmptyState icon={Trophy} title="The CRM isn't connected yet" description="Once the owner connects it, leads won in the CRM appear here every morning." />;
  }
  return (
    <div className="space-y-3">
      <ConfirmForm action={syncLeadsAction} fields={{}} label="Check the CRM now" pendingLabel="Checking…" />
      {r.value.leads.length === 0 ? (
        <EmptyState icon={Trophy} title="Nothing waiting" description="Every won lead is set up as a client." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          {r.value.leads.map((l) => (
            <li key={l.rowId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{l.institution ?? l.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[l.institution && l.name !== l.institution ? l.name : null, l.segment, l.ownerName ? `won by ${l.ownerName}` : null, l.wonAt ? formatDate(istDate(l.wonAt)) : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <Button asChild size="sm">
                <Link href={`/clients/new?lead=${l.rowId}`}>Set up as client</Link>
              </Button>
              <ConfirmForm action={dismissLeadAction} fields={{ rowId: l.rowId }} label="Not a client" variant="ghost" confirm={`Take ${l.institution ?? l.name} off the list?`} showSuccess={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
