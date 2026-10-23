import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, LoadingRows } from "@/components/states";
import { formatMonth } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requirePortalUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Reports", robots: { index: false, follow: false } };

async function Reports() {
  const user = await requirePortalUser();
  const months = await getServices().portal.reports(user);
  if (months.length === 0) return <EmptyState title="No reports yet" description="Your monthly report shows here once Oppllo finalises it." />;
  return (
    <ul className="divide-y rounded-lg border bg-card shadow-card">
      {months.map((m) => (
        <li key={m}>
          <Link href={`/portal/reports/${m.slice(0, 7)}` as Route} className="block px-4 py-3 text-sm font-medium hover:bg-hover">
            {formatMonth(m)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function PortalReportsPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Monthly reports</h1>
      <Suspense fallback={<LoadingRows rows={3} columns={1} label="Loading reports" />}>
        <Reports />
      </Suspense>
    </>
  );
}
