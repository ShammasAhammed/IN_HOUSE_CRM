import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Plus } from "lucide-react";
import { BurnMeter } from "@/components/burn-meter";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { formatRupees } from "@/lib/format";
import { CLIENT_SEGMENT_LABELS, CLIENT_STATUSES, CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/types";
import type { ClientBurn, ClientListItem } from "@/services/clients";
import { can } from "@/services/permissions";

export const metadata: Metadata = { title: "Clients" };

const STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  onboarding: "info",
  active: "success",
  paused: "warning",
  churned: "neutral",
};

export default function ClientsPage({ searchParams }: PageProps<"/clients">) {
  return (
    <>
      <PageHeader title="Clients" description="Everyone Oppllo works for, with this month's retainer burn." />
      <Suspense fallback={null}>
        <WonLeadsBanner />
      </Suspense>
      <Suspense fallback={<LoadingRows rows={8} columns={5} label="Loading clients" />}>
        <ClientTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ClientTable({ searchParams }: { searchParams: PageProps<"/clients">["searchParams"] }) {
  const actor = await requireActor();
  const [result, sp] = await Promise.all([getServices().clients.list(actor), searchParams]);
  if (!result.ok) return <ErrorState error={result.error} />;

  const { clients: everyone, visible } = result.value;
  // Search by name, city and main contact, and filter by status (QA S4-B2). Only what this person can see is searched.
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const status = typeof sp.status === "string" && (CLIENT_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as ClientStatus) : "";
  const needle = q.toLowerCase();
  const clients = everyone.filter(
    (c) =>
      (!needle || [c.name, c.profile?.city, c.primaryContact?.name].some((v) => v?.toLowerCase().includes(needle))) &&
      (!status || c.profile?.status === status),
  );
  const addButton = can(actor, "clients.write") ? (
    <Button size="sm" asChild>
      <Link href="/clients/new">
        <Plus /> Add client
      </Link>
    </Button>
  ) : null;
  if (everyone.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No clients yet"
        description="Clients appear here when a lead is won in the CRM, or when one is added by hand."
        action={addButton}
      />
    );
  }

  // Columns follow what the service says this person may see.
  const totalRetainer = everyone.reduce((sum, c) => sum + (c.monthlyRetainerPaise ?? 0), 0);
  const hot = everyone.filter((c) => c.burn && c.burn.alertLevel !== "ok").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {visible.profile ? (
          <span>
            <span className="tabular font-medium text-foreground">{everyone.filter((c) => c.profile?.status === "active").length}</span> active of{" "}
            {everyone.length}
          </span>
        ) : (
          <span>
            <span className="tabular font-medium text-foreground">{everyone.length}</span> clients with your tasks
          </span>
        )}
        {visible.money ? (
          <span>
            <span className="tabular font-medium text-foreground">{formatRupees(totalRetainer)}</span> monthly retainers
          </span>
        ) : null}
        {visible.burn ? (
          <span>
            <span className="tabular font-medium text-foreground">{hot}</span> with a retainer over 80% of hours
          </span>
        ) : null}
        {addButton ? <span className="ml-auto">{addButton}</span> : null}
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder={visible.contacts ? "Search name, city or contact" : "Search name or city"} aria-label="Search clients" className="h-9 w-64 max-w-full" />
        {visible.profile ? (
          <Select name="status" defaultValue={status} aria-label="Filter by status" className="h-9 w-auto">
            <option value="">Any status</option>
            {CLIENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {CLIENT_STATUS_LABELS[st]}
              </option>
            ))}
          </Select>
        ) : null}
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
        {q || status ? (
          <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        ) : null}
      </form>

      {clients.length === 0 ? <EmptyState icon={Building2} title="Nothing matches" description="Try other words, or clear the search and status." /> : null}

      {/* Desktop: a table. Phone: cards. */}
      <div className={clients.length ? "hidden md:block" : "hidden"}>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Client</TableHead>
              {visible.profile ? <TableHead>Services</TableHead> : null}
              {visible.profile ? <TableHead>Status</TableHead> : null}
              <TableHead className="text-right">{visible.profile ? "Open tasks" : "Your open tasks"}</TableHead>
              {visible.burn ? <TableHead>Hours this month</TableHead> : null}
              {visible.money ? <TableHead className="text-right">Retainer / month</TableHead> : null}
              {visible.contacts ? <TableHead>Main contact</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((c) => (
              <TableRow key={c.id}>
                {/* A width cap so a long name ends in "…" (full name on hover) instead of pushing columns off screen (QA S9-22). */}
                <TableCell className="max-w-72">
                  <div className="flex items-center gap-2.5">
                    <ClientMark name={c.name} />
                    <div className="min-w-0">
                      <Link href={`/clients/${c.id}`} title={c.name} className="block truncate font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.profile ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {CLIENT_SEGMENT_LABELS[c.profile.segment]}
                          {c.profile.city ? ` · ${c.profile.city}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                {c.profile ? (
                  <TableCell className="max-w-56">
                    <ServiceList services={c.profile.services} />
                  </TableCell>
                ) : null}
                {c.profile ? (
                  <TableCell>
                    <Badge tone={STATUS_TONE[c.profile.status]}>{CLIENT_STATUS_LABELS[c.profile.status]}</Badge>
                  </TableCell>
                ) : null}
                <TableCell className="tabular text-right">
                  <span className="font-medium">{c.openTasks}</span>
                  {c.overdueTasks > 0 ? <span className="ml-1.5 text-xs text-danger">{c.overdueTasks} late</span> : null}
                </TableCell>
                {visible.burn ? (
                  <TableCell>{c.burn ? <ClientBurnCell burn={c.burn} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                ) : null}
                {visible.money ? (
                  <TableCell className="tabular text-right">
                    {c.monthlyRetainerPaise ? formatRupees(c.monthlyRetainerPaise) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ) : null}
                {visible.contacts ? (
                  <TableCell>
                    {c.primaryContact ? (
                      <div className="min-w-0 leading-tight">
                        <p className="truncate text-sm">{c.primaryContact.name}</p>
                        <p className="tabular truncate text-xs text-muted-foreground">{c.primaryContact.phone}</p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {clients.map((c) => (
          <ClientCard key={c.id} client={c} />
        ))}
      </ul>
    </div>
  );
}

function ClientCard({ client: c }: { client: ClientListItem }) {
  return (
    <li className="rounded-lg border bg-card p-3 shadow-card">
      <div className="flex items-start gap-2.5">
        <ClientMark name={c.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/clients/${c.id}`} className="block truncate font-medium hover:underline">
              {c.name}
            </Link>
            {c.profile ? <Badge tone={STATUS_TONE[c.profile.status]}>{CLIENT_STATUS_LABELS[c.profile.status]}</Badge> : null}
          </div>
          {c.profile ? (
            <p className="truncate text-xs text-muted-foreground">{c.profile.services.join(" · ") || CLIENT_SEGMENT_LABELS[c.profile.segment]}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          <span className="tabular text-sm font-medium text-foreground">{c.openTasks}</span> open
          {c.overdueTasks > 0 ? <span className="ml-1 text-danger">· {c.overdueTasks} late</span> : null}
        </p>
        {c.burn ? <ClientBurnCell burn={c.burn} /> : null}
      </div>
    </li>
  );
}

/** Combined meter; names the retainer at risk when one is hotter than the total suggests. */
function ClientBurnCell({ burn }: { burn: ClientBurn }) {
  const hottest = burn.retainers[0];
  const flag = burn.retainers.length > 1 && hottest && hottest.level !== "ok" && burn.alertLevel !== burn.level ? hottest : null;
  return (
    <div>
      <BurnMeter {...burn} compact />
      {flag ? (
        <p className={flag.level === "over" ? "mt-1 text-xs text-danger" : "mt-1 text-xs text-warning"}>
          {flag.serviceName.replace(" for admissions", "")} at {flag.usedPercent}%
        </p>
      ) : null}
    </div>
  );
}

function ServiceList({ services }: { services: string[] }) {
  if (services.length === 0) return <span className="text-muted-foreground">No active service</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {services.map((s) => (
        <Badge key={s} tone="outline" className="font-normal">
          {s}
        </Badge>
      ))}
    </div>
  );
}

/** A client's initials in a square, to tell clients apart from people (round). */
function ClientMark({ name }: { name: string }) {
  return <Avatar name={name} className="rounded-md" />;
}

/** Won in the CRM and not set up yet (Stage 8.3): only for the BDO and the owner. */
async function WonLeadsBanner() {
  const actor = await requireActor();
  const r = await getServices().crm.inbox(actor);
  if (!r.ok || r.value.leads.length === 0) return null;
  const n = r.value.leads.length;
  return (
    <Link href="/clients/won" className="mb-4 flex items-center gap-3 rounded-lg border border-success/30 bg-success-soft px-4 py-2.5 text-sm text-success hover:brightness-95">
      <span className="flex-1 font-medium">
        {n} won {n === 1 ? "lead waits" : "leads wait"} to be set up as {n === 1 ? "a client" : "clients"}
      </span>
      <span>Set up →</span>
    </Link>
  );
}
