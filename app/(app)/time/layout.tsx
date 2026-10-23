import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TabsNav, type Tab } from "@/components/tabs-nav";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";

async function TimeTabs() {
  const actor = await requireActor();
  if (!can(actor, "time.read.all")) return null;
  const tabs: Tab[] = [
    { href: "/time", label: "My week", exact: true },
    { href: "/time/team", label: "Team" },
  ];
  return <TabsNav tabs={tabs} />;
}

export default function TimeLayout({ children }: LayoutProps<"/time">) {
  return (
    <>
      <PageHeader title="Time" description="Hours spent, week by week. Rough is fine; days with a gap are marked." />
      <Suspense fallback={null}>
        <TimeTabs />
      </Suspense>
      {children}
    </>
  );
}
