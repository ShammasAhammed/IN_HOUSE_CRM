// Issue a letter to a person (HR slice 3): the template filled with their details, editable before issuing.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { LETTER_KINDS, LETTER_KIND_LABELS, type LetterKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LETTER_FIELD_LABELS } from "@/services/rules/letters";
import { IssueLetterForm } from "../../talent-forms";

export const metadata: Metadata = { title: "Issue a letter" };

export default function LetterPage({ params, searchParams }: PageProps<"/people/[id]/letter">) {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={1} label="Loading" />}>
      <Letter params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Letter({ params, searchParams }: Pick<PageProps<"/people/[id]/letter">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const asked = (LETTER_KINDS as readonly string[]).includes(String(sp.kind)) ? (sp.kind as LetterKind) : undefined;
  const r = await getServices().talent.draftLetter(actor, id, asked);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { kind, missing } = r.value;
  return (
    <div className="max-w-3xl space-y-4">
      <BackLink fallback={`/people/${id}` as Route} />
      <PageHeader title="Issue a letter" />
      <nav aria-label="Kind of letter" className="flex flex-wrap gap-1.5">
        {LETTER_KINDS.map((k) => (
          <Link key={k} href={`/people/${id}/letter?kind=${k}` as Route} className={cn("rounded-md border px-2.5 py-1 text-sm", k === kind ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-hover")}>
            {LETTER_KIND_LABELS[k]}
          </Link>
        ))}
      </nav>
      {missing.length ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Nothing to fill in for: {missing.map((f) => LETTER_FIELD_LABELS[f]).join(", ")}. These show as “—”. Add them to the person&apos;s record, or type them into the letter below before issuing.
        </p>
      ) : null}
      <IssueLetterForm key={kind} personId={id} kind={kind} title={r.value.title} body={r.value.body} />
    </div>
  );
}
