import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { ConsentPanel } from "../../../consent/consent-panel";
import { ExternalLink, MessageCircle, Phone } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { AiHintBadge, ScoreBadge, StageBadge, Tags } from "@/components/lead-bits";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRupees } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { istDate, istTime } from "@/lib/dates";
import { EditLeadForm, FollowUpForm, NoteForm, OwnerForm, StageForm, TagsForm } from "../../lead-forms";
import { WhatsAppMenu } from "../../sales-extras";

export const metadata: Metadata = { title: "Lead" };

export default function LeadPage({ params }: PageProps<"/sales/leads/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={8} columns={2} label="Loading the lead" />}>
      <Lead params={params} />
    </Suspense>
  );
}

/** Digits for tel: and WhatsApp links; 10-digit Indian numbers get 91. */
function digits(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  return d;
}

async function Lead({ params }: { params: PageProps<"/sales/leads/[id]">["params"] }) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const [r, mirror, templates, scores] = await Promise.all([services.leads.page(actor, id), services.leads.mirror(actor), services.leads.templates(actor), services.leadScores.forLeads(actor, [id])]);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (!scores.has(id)) after(() => services.leadScores.scoreLead(actor, id));
  const { lead: l, activities } = r.value;
  const canEdit = mirror.ok && mirror.value.canEdit;
  const live = mirror.ok && mirror.value.live;
  const [dir, options] = canEdit ? await Promise.all([services.people.directory(actor), services.leads.filterOptions(actor)]) : [null, null];
  const people = dir?.ok ? dir.value.filter((p) => p.status === "active").map((p) => ({ id: p.id, fullName: p.fullName })) : [];
  const money = (p: number | null) => (p === null ? null : formatRupees(p));
  const facts: Array<[string, string | null]> = [
    ["Contact", [l.name, l.contactRole].filter(Boolean).join(", ") || null],
    ["Email", l.email],
    ["District", l.district],
    ["Type", l.segment],
    ["Problem", l.problem],
    ["Wants to start", l.timeline],
    ["Seats / joined", l.seats !== null ? `${l.seats} / ${l.admissions ?? "—"}` : null],
    ["Average fee", money(l.feePaise)],
    ["Monthly ad spend", money(l.spendPaise)],
    ["Agent commission", money(l.commissionPaise)],
    ["Cost per student (est.)", money(l.costPerAdmissionPaise)],
    ["Lost because", l.stage === "lost" ? l.lostReason : null],
  ];
  const source: Array<[string, string | null]> = [
    ["Channel", l.channel ?? l.origin],
    ["Campaign", l.campaign],
    ["Landing page", l.landing],
    ["UTM", [l.utmSource, l.utmMedium, l.utmContent, l.utmTerm].filter(Boolean).join(" / ") || null],
    ["Came in", formatDateTime(l.createdAt)],
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <BackLink fallback="/sales/leads" />
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{l.institution ?? l.name}</h1>
            <p className="text-sm text-muted-foreground">
              {l.ownerName ? `Owner: ${l.ownerName}` : "Nobody owns this lead yet"}
              {l.nextFollowUpAt ? ` · next follow-up ${formatDateTime(l.nextFollowUpAt)}` : " · no follow-up set"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tags tags={l.tags ?? []} />
            <AiHintBadge hint={scores.get(id)} />
            <ScoreBadge score={l.score} />
            <StageBadge stage={l.stage} />
          </div>
        </div>
        {l.clientId ? (
          <p className="mt-2 text-sm">
            Now a client:{" "}
            <Link href={`/clients/${l.clientId}`} className="font-medium text-primary hover:underline">
              {l.clientName}
            </Link>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {l.phone ? (
          <>
            <Button asChild size="sm" variant="outline">
              <a href={`tel:+${digits(l.phone)}`}>
                <Phone /> {l.phone}
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`https://wa.me/${digits(l.phone)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          </>
        ) : null}
        {l.crmId && !live ? (
          <Button asChild size="sm" variant="ghost">
            <a href={`https://crm.oppllo.com/leads/${encodeURIComponent(l.crmId)}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Open in the CRM to change it
            </a>
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <section className="grid gap-x-6 gap-y-2 rounded-lg border bg-card p-4 shadow-card sm:grid-cols-2" aria-label="Work this lead">
          <StageForm leadId={l.id} stage={l.stage} lostReason={l.lostReason} />
          <OwnerForm leadId={l.id} ownerId={l.ownerId} people={people} />
          <FollowUpForm leadId={l.id} current={l.nextFollowUpAt ? `${istDate(l.nextFollowUpAt)}T${istTime(l.nextFollowUpAt)}` : ""} />
          <div className="sm:col-span-2">
            <TagsForm leadId={l.id} tags={l.tags ?? []} known={options?.ok ? options.value.tags.map((t) => t.tag) : []} />
          </div>
          <div className="sm:col-span-2">
            <NoteForm leadId={l.id} />
          </div>
        </section>
      ) : null}
      {canEdit ? (
        <EditLeadForm
          leadId={l.id}
          details={{ name: l.name, phone: l.phone, email: l.email, institution: l.institution, contactRole: l.contactRole, district: l.district, segment: l.segment, channel: l.channel, score: l.score, problem: l.problem }}
        />
      ) : null}

      {l.phone && templates.ok && templates.value.templates.length ? <WhatsAppMenu leadId={l.id} templates={templates.value.templates} /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Facts title="About" rows={facts} />
        <Facts title="Where it came from" rows={source} />
      </div>

      {l.answers && Object.keys(l.answers).length ? <Facts title="Form answers" rows={Object.entries(l.answers)} /> : null}

      <Suspense fallback={null}>
        <ConsentPanel subjectType="lead" subjectId={l.id} />
      </Suspense>

      <section className="space-y-2" aria-label="Timeline">
        <h2 className="text-sm font-semibold">Timeline</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ol className="divide-y rounded-lg border bg-card shadow-card">
            {activities.map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                <p className="break-words whitespace-pre-wrap">{a.text || "—"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[a.byName, formatDateTime(a.at)].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Facts({ title, rows }: { title: string; rows: Array<[string, string | null]> }) {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <section className="rounded-lg border bg-card p-4 shadow-card" aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <dl className="space-y-1.5 text-sm">
        {shown.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[9rem_1fr] gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
