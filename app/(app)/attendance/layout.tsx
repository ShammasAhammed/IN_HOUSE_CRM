import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { TabsNav, type Tab } from "@/components/tabs-nav";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";

async function AttendanceTabs() {
  const actor = await requireActor();
  const team = can(actor, "attendance.read.all");
  const tabs: Tab[] = [
    { href: "/attendance", label: "Today", exact: true },
    // HR and the owner open anyone's month from Team, so theirs isn't always "my" month.
    { href: "/attendance/month", label: team ? "Month" : "My month" },
    ...(team ? [{ href: "/attendance/team", label: "Team" } as Tab] : []),
  ];
  return <TabsNav tabs={tabs} />;
}

export default function AttendanceLayout({ children }: LayoutProps<"/attendance">) {
  return (
    <>
      <PageHeader title="Attendance" description="Who is where today, and your month. Office, home or a client site all count as working." />
      <Suspense fallback={<div className="mb-5 h-9 border-b" />}>
        <AttendanceTabs />
      </Suspense>
      {children}
    </>
  );
}
