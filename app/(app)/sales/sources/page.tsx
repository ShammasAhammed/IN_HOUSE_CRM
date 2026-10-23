import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingRows } from "@/components/states";
import { countOf, formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { GoLiveForm } from "../lead-forms";
import { AutoAssignForm } from "./auto-assign-form";
import { ConversionsForm } from "./conversions-form";

export const metadata: Metadata = { title: "Lead sources" };

export default function SourcesPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={3} label="Loading lead sources" />}>
      <Sources />
    </Suspense>
  );
}

function Address({ label, url, ready }: { label: string; url: string; ready?: boolean }) {
  return (
    <li className="space-y-1 px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        {ready === undefined ? null : ready ? <Badge tone="success">Set up</Badge> : <Badge tone="warning">Keys not added yet</Badge>}
      </div>
      <code className="block text-xs break-all text-muted-foreground">{url}</code>
    </li>
  );
}

async function Sources() {
  const actor = await requireActor();
  const [r, conv, live, auto] = await Promise.all([getServices().leads.intakeSetup(actor), getServices().conversions.settings(actor), getServices().leads.isLive(), getServices().leads.autoAssign(actor)]);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (!auto.ok) return <ErrorState error={auto.error} />;
  if (!conv.ok) return <ErrorState error={conv.error} />;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { sources, metaReady, googleReady, lastError } = r.value;
  return (
    <div className="max-w-3xl space-y-5">
      {live ? (
        <p className="rounded-lg bg-success-soft px-4 py-3 text-sm text-success">Sales works in Oppllo One. The morning copy only adds leads that still reach the CRM.</p>
      ) : (
        <section className="space-y-2 rounded-lg border bg-card p-4 shadow-card" aria-label="Switch day">
          <h2 className="text-sm font-semibold">Switch day</h2>
          <p className="text-sm text-muted-foreground">When everything below is pointed here and the last copy is done, switch Sales over: the team starts working leads in Oppllo One.</p>
          <GoLiveForm />
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        Where new leads come in. Until switch day these still go to the CRM; on switch day each one is pointed here.
      </p>
      <section className="space-y-2 rounded-lg border bg-card p-4 shadow-card" aria-label="Auto-assign">
        <h2 className="text-sm font-semibold">Share new leads in turn</h2>
        <p className="text-sm text-muted-foreground">
          Each lead from a landing page, Meta or Google form goes to the next BDO, who is told at once. {auto.value.bdos.length ? `In turn: ${auto.value.bdos.join(", ")}.` : "There's no active BDO yet."}
        </p>
        {auto.value.canEdit ? <AutoAssignForm on={auto.value.on} /> : <p className="text-sm">{auto.value.on ? "On" : "Off"}</p>}
      </section>
      {lastError ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          Last lead that couldn&apos;t be saved: {lastError.source}, {formatDateTime(new Date(lastError.at))}. {lastError.message}
        </p>
      ) : null}
      <section className="space-y-2" aria-label="Ad platforms">
        <h2 className="text-sm font-semibold">Ad platforms</h2>
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          <Address label="Meta lead ads (webhook)" url={`${origin}/api/meta-webhook`} ready={metaReady} />
          <Address label="Google Ads lead form (webhook)" url={`${origin}/api/google-lead`} ready={googleReady} />
        </ul>
      </section>
      <section className="space-y-2" aria-label="Send results to ads">
        <h2 className="text-sm font-semibold">Send results to ads</h2>
        <p className="text-sm text-muted-foreground">So Meta and Google learn which ads bring real clients, not just form fills.</p>
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          <Address label="Meta Conversions API" url="Sent when a lead reaches a stage below" ready={conv.value.metaReady} />
          <Address label="Google Ads offline import (daily CSV)" url={`${origin}/api/google-conversions?key=…`} ready={conv.value.googleReady} />
        </ul>
        <ConversionsForm saved={conv.value} />
      </section>
      <section className="space-y-2" aria-label="Landing pages">
        <h2 className="text-sm font-semibold">Landing pages</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. They&apos;re copied from the CRM&apos;s Settings → Landing pages with the leads.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-card">
            {sources.map((src) => (
              <li key={src.key} className="space-y-1 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{src.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {src.active ? null : <Badge tone="neutral">Off</Badge>} {countOf(src.leadCount, "lead")}{src.lastLeadAt ? ` · last ${formatDateTime(src.lastLeadAt)}` : ""}
                  </span>
                </div>
                {src.url ? <p className="truncate text-xs text-muted-foreground">{src.url}</p> : null}
                <code className="block text-xs break-all">{`${origin}/api/lead/${src.key}`}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
