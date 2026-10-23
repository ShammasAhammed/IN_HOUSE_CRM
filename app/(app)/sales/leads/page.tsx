import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { after } from "next/server";
import { Download, FileUp, Search, Target } from "lucide-react";
import { LeadItem } from "@/components/lead-bits";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LEAD_SCORES, LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/types";
import type { LeadListFilter } from "@/services/leads";
import { NewLeadForm } from "../lead-forms";
import { BulkLeadList } from "./bulk-list";
import { SavedViews } from "../sales-extras";

export const metadata: Metadata = { title: "Leads" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const FILTER_KEYS = ["q", "stage", "owner", "tag", "channel", "district", "segment", "score", "due"] as const;

export default function LeadsPage({ searchParams }: PageProps<"/sales/leads">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} columns={3} label="Loading leads" />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}

async function Leads({ searchParams }: { searchParams: PageProps<"/sales/leads">["searchParams"] }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const filter = Object.fromEntries(FILTER_KEYS.map((k) => [k, one(sp[k])])) as Required<LeadListFilter>;
  filter.stage ||= "open";
  const services = getServices();
  const [r, mirror, options, views] = await Promise.all([services.leads.list(actor, filter), services.leads.mirror(actor), services.leads.filterOptions(actor), services.leads.views(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  // New leads get the decision helper's hint after this page is sent (12.3); it shows on the next look.
  after(() => services.leadScores.scoreNew(actor));
  const scores = await services.leadScores.forLeads(actor, r.value.map((l) => l.id));
  const hints = Object.fromEntries([...scores].map(([id, h]) => [id, { label: h.label, score: h.score, junk: h.junk }]));
  const canEdit = mirror.ok && mirror.value.canEdit;
  const canExport = actor.capabilities.has("leads.write");
  const dir = canEdit ? await services.people.directory(actor) : null;
  const people = dir?.ok ? dir.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, fullName: p.fullName })) : [];
  const o = options.ok ? options.value : { tags: [], channels: [], districts: [], segments: [], owners: [] };
  const more = ["tag", "channel", "district", "segment", "score", "due"].some((k) => filter[k as keyof typeof filter]);
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
  const now = new Date();
  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        {canEdit ? <NewLeadForm /> : null}
        {canEdit ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/sales/import">
              <FileUp /> Import
            </Link>
          </Button>
        ) : null}
        {canExport ? (
          <Button asChild size="sm" variant="outline">
            <a href={`/sales/leads/export?${query}`}>
              <Download /> Export CSV
            </a>
          </Button>
        ) : null}
      </div>
      <SavedViews views={views.ok ? views.value : []} query={query} />
      <form key={query} className="space-y-2" role="search">
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input name="q" defaultValue={filter.q} placeholder="Name, institution, phone or email" className="h-9 pl-8" />
          </label>
          <Select name="stage" defaultValue={filter.stage} aria-label="Stage" className="h-9 w-auto">
            <option value="open">Open leads</option>
            <option value="all">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select name="owner" defaultValue={filter.owner} aria-label="Owner" className="h-9 w-auto">
            <option value="">Anyone</option>
            <option value="me">Mine</option>
            <option value="none">Unassigned</option>
            <option value="nologin">Owner has no Oppllo login</option>
            {o.owners.length ? (
              <optgroup label="Owner">
                {o.owners.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
          <Button type="submit" size="sm" variant="outline" className="h-9">
            Show
          </Button>
        </div>
        <details open={more} className="rounded-md">
          <summary className="cursor-pointer text-xs text-muted-foreground">More filters</summary>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Pick name="tag" label="Tag" value={filter.tag} options={o.tags.map((t) => [t.tag, `${t.tag} (${t.count})`])} />
            <Pick name="due" label="Follow-up" value={filter.due} options={[["overdue", "Overdue"], ["today", "Due today"], ["week", "Next 7 days"], ["none", "None set"]]} />
            <Pick name="score" label="Score" value={filter.score} options={LEAD_SCORES.map((s) => [s, s[0]!.toUpperCase() + s.slice(1)])} />
            <Pick name="channel" label="Channel" value={filter.channel} options={o.channels.map((c) => [c, c])} />
            <Pick name="district" label="District" value={filter.district} options={o.districts.map((c) => [c, c])} />
            <Pick name="segment" label="Type" value={filter.segment} options={o.segments.map((c) => [c, c])} />
          </div>
        </details>
      </form>
      {r.value.length === 0 ? (
        <EmptyState icon={Target} title="No leads match" description={filter.q || more ? "Try fewer filters, or another stage." : "Leads appear here once they're copied from the CRM."} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {r.value.length === 500 ? "The newest 500. Filter to narrow it down." : `${r.value.length} ${r.value.length === 1 ? "lead" : "leads"}, newest first.`}
          </p>
          {canEdit ? (
            <BulkLeadList key={query} leads={r.value} people={people} tags={o.tags.map((t) => t.tag)} hints={hints} />
          ) : (
            <ul className="divide-y rounded-lg border bg-card shadow-card">
              {r.value.map((l) => (
                <LeadItem key={l.id} lead={l} now={now} hint={hints[l.id]} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Pick({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <Select name={name} defaultValue={value} aria-label={`Filter by ${label.toLowerCase()}`} className="h-9">
      <option value="">{label}: any</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </Select>
  );
}
