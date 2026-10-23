import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TabsNav, type Tab } from "@/components/tabs-nav";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";

async function LeaveTabs() {
  const actor = await requireActor();
  const leave = getServices().leave;
  const [waiting, approver] = await Promise.all([leave.waitingOnMeCount(actor), leave.isApprover(actor)]);
  const tabs: Tab[] = [
    { href: "/leave", label: "My leave", exact: true },
    { href: "/leave/calendar", label: "Team calendar" },
    ...(waiting > 0 || approver ? [{ href: "/leave/approvals", label: "Approvals", count: waiting } as Tab] : []),
    { href: "/leave/holidays", label: "Holidays" },
    ...(can(actor, "leave.manage") ? [{ href: "/leave/settings", label: "Settings" } as Tab] : []),
  ];
  return <TabsNav tabs={tabs} />;
}

export default function LeaveLayout({ children }: LayoutProps<"/leave">) {
  return (
    <>
      <PageHeader title="Leave" description="Ask for time off, see who's away, and keep track of your balance." />
      <Suspense fallback={<div className="mb-5 h-9 border-b" />}>
        <LeaveTabs />
      </Suspense>
      {children}
    </>
  );
}
