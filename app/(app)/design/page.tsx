// The living style guide: every token, component and state in one place, for approving the look.
import type { Metadata } from "next";
import { Building2, Plus } from "lucide-react";
import { BurnMeter } from "@/components/burn-meter";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Design system" };

const SWATCHES = [
  ["background", "bg-background"],
  ["sidebar", "bg-sidebar"],
  ["card", "bg-card"],
  ["subtle", "bg-subtle"],
  ["hover", "bg-hover"],
  ["border", "bg-border"],
  ["foreground", "bg-foreground"],
  ["foreground-2", "bg-foreground-2"],
  ["muted-foreground", "bg-muted-foreground"],
  ["primary", "bg-primary"],
  ["accent", "bg-accent"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["danger", "bg-danger"],
  ["info", "bg-info"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="space-y-10">
      <PageHeader title="Design system" description="Oppllo One's colours, type and standard states." />

      <Section title="Colour tokens">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="overflow-hidden rounded-lg border bg-card">
              <div className={`h-12 border-b ${cls}`} />
              <p className="px-2 py-1.5 font-mono text-xs break-all text-muted-foreground">{name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-xl font-semibold tracking-tight">Page title — Clients</p>
            <p className="text-sm font-semibold">Section title — This month</p>
            <p className="text-sm">Body — Design static ad creatives for the January intake campaign.</p>
            <p className="text-xs text-muted-foreground">Meta — Due Wed, 14 Oct · Zenith IAS Academy</p>
            <p className="tabular text-sm">Numbers line up — ₹1,25,000 · 12.5 h · 85%</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Buttons and badges">
        <div className="flex flex-wrap items-center gap-2">
          <Button>
            <Plus /> New task
          </Button>
          <Button variant="outline">Log 30 min</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Remove</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="brand">Brand</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Paused</Badge>
          <Badge tone="danger">Overdue</Badge>
          <Badge tone="info">Onboarding</Badge>
          <Badge tone="outline">Meta ads</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Avatar name="Anjali Nair" size="sm" />
          <Avatar name="Rahul Krishnan" />
          <Avatar name="Fathima Sherin" size="lg" />
          <Avatar name="Zenith IAS Academy" className="rounded-md" />
          <span className="text-xs text-muted-foreground">People are round, clients are square.</span>
        </div>
      </Section>

      <Section title="Retainer burn">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["On track", 1200, 2400, 50, 45, "ok"],
              ["Warning at 80%", 2040, 2400, 85, 45, "warning"],
              ["Over budget", 2760, 2400, 115, 90, "over"],
            ] as const
          ).map(([label, used, budget, pct, elapsed, level]) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <BurnMeter usedMinutes={used} budgetMinutes={budget} usedPercent={pct} elapsedPercent={elapsed} level={level} />
                <p className="mt-2 text-xs text-muted-foreground">The tick marks how far through the month we are.</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Loading">
        <LoadingRows rows={3} columns={4} />
      </Section>

      <Section title="Empty">
        <EmptyState icon={Building2} title="No clients yet" description="Clients appear here when a lead is won in the CRM, or when one is added by hand." />
      </Section>

      <Section title="Error and not allowed">
        <div className="grid gap-4 sm:grid-cols-2">
          <ErrorState error={{ code: "unexpected", message: "We couldn't reach the database. Try again in a minute." }} action={<Button variant="outline">Try again</Button>} />
          <ErrorState error={{ code: "forbidden", message: "Client work isn't part of your role." }} />
        </div>
      </Section>

      <Section title="Success">
        <SuccessNotice>Leave request sent to Anjali for approval.</SuccessNotice>
      </Section>
    </div>
  );
}
