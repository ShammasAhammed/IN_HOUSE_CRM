import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType } from "@/lib/types";
import { AddLeaveTypeForm, GrantForm, LeaveTypeActive, QuotaForm } from "./settings-forms";
import { countOf } from "@/lib/format";

export const metadata: Metadata = { title: "Leave settings" };

const QUOTA_TYPES: EmploymentType[] = ["full_time", "part_time", "intern"];

export default function LeaveSettingsPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={4} label="Loading settings" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const actor = await requireActor();
  const services = getServices();
  const types = await services.leave.types(actor);
  if (!types.ok) return <ErrorState error={types.error} />;
  const directory = await services.people.directory(actor);
  if (!directory.ok) return <ErrorState error={directory.error} />;
  const people = directory.value.map((p) => ({ id: p.id, name: p.fullName }));
  const quotaTypes = types.value.filter((t) => t.active && t.usesBalance && !t.grantedOnly);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Yearly quotas</h2>
          <p className="text-xs text-muted-foreground">
            Days per calendar year. People who join mid-year get a share by months left. Unused days lapse on 31 December. Freelancers don&apos;t take leave here.
          </p>
        </div>
        {quotaTypes.length === 0 ? <p className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">No leave types with yearly days yet. Add one on the right, and people can ask for leave.</p> : null}
        <div className="overflow-x-auto rounded-lg border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-subtle">
              <tr className="border-b">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Leave type</th>
                {QUOTA_TYPES.map((e) => (
                  <th key={e} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {EMPLOYMENT_TYPE_LABELS[e]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotaTypes.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-3 py-2.5 font-medium">
                    {t.name} <LeaveTypeActive leaveTypeId={t.id} active={t.active} />
                  </td>
                  {QUOTA_TYPES.map((e) => (
                    <td key={e} className="px-3 py-2">
                      <QuotaForm leaveTypeId={t.id} employmentType={e} days={(t.quotas[e] ?? 0) / 2} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-1.5 text-sm">
          {types.value
            .filter((t) => !quotaTypes.includes(t))
            .map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2">
                <span className={t.active ? "font-medium" : "font-medium text-muted-foreground line-through"}>{t.name}</span>
                <Badge tone="neutral">{!t.active ? "Retired" : t.grantedOnly ? (t.grantExpiryDays ? `Granted, expires after ${countOf(t.grantExpiryDays, "day")}` : "Granted") : t.usesBalance ? "Days each year" : "No balance, needs approval"}</Badge>
                <LeaveTypeActive leaveTypeId={t.id} active={t.active} />
              </li>
            ))}
        </ul>
      </section>
      <div className="space-y-6">
        <AddLeaveTypeForm />
        <GrantForm people={people} types={types.value.filter((t) => t.active && t.usesBalance).map((t) => ({ id: t.id, name: t.name, key: t.key }))} />
      </div>
    </div>
  );
}
