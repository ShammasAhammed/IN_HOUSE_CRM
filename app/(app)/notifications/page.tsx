import type { Metadata } from "next";
import { Suspense } from "react";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" description="What needs you. Anything unread is also emailed once a day." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading notifications" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const actor = await requireActor();
  const r = await getServices().notifications.list(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (r.value.length === 0) return <EmptyState icon={Bell} title="Nothing yet" description="You'll hear here when a task is given to you, leave is decided, or a creative needs you." />;
  return <NotificationList items={r.value} />;
}
