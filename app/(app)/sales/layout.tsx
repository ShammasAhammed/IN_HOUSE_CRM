import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TabsNav } from "@/components/tabs-nav";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { CopyFromCrmButton } from "./copy-button";

export default function SalesLayout({ children }: LayoutProps<"/sales">) {
  return (
    <>
      <PageHeader title="Sales" description="Leads and the pipeline, moved in from the CRM." />
      <Suspense fallback={null}>
        <MirrorNotice />
      </Suspense>
      {/* The tabs read the address; under a lead's page that is only known at request time. */}
      <Suspense fallback={<div className="mb-5 h-10 border-b" />}>
        <TabsNav
          tabs={[
            { href: "/sales", label: "Today", exact: true },
            { href: "/sales/leads", label: "Leads" },
            { href: "/sales/pipeline", label: "Pipeline" },
            { href: "/sales/dashboard", label: "Dashboard" },
            { href: "/sales/templates", label: "Templates" },
            { href: "/sales/sources", label: "Lead sources" },
          ]}
        />
      </Suspense>
      {children}
    </>
  );
}

/** Until switch day, Oppllo One only mirrors the CRM: say so, and where to make changes. */
async function MirrorNotice() {
  const actor = await requireActor();
  const r = await getServices().leads.mirror(actor);
  if (!r.ok || r.value.live) return null;
  const m = r.value;
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-lg bg-info-soft px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        This is a copy of <a href="https://crm.oppllo.com" className="font-medium underline">crm.oppllo.com</a>. Keep working leads there until switch day.{" "}
        <span className="text-muted-foreground">
          {!m.crmConnected ? "The CRM isn't connected." : m.lastCopiedAt ? `Last copied ${formatDateTime(m.lastCopiedAt)}; copied again every morning.` : "Not copied yet."}
        </span>
      </p>
      {m.canCopy && m.crmConnected ? <CopyFromCrmButton /> : null}
    </div>
  );
}
