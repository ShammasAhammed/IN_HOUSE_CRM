// One request form: fill it in. Leads also see its public link and can change it.
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { submitRequestAction } from "../actions";
import { FillForm } from "../form-ui";

export const metadata: Metadata = { title: "Request" };

export default function RequestFormPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={1} label="Loading the form" />}>
      <RequestForm params={params} />
    </Suspense>
  );
}

async function RequestForm({ params }: Pick<PageProps<"/requests/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const r = await getServices().requestForms.get(actor, id);
  if (!r.ok) return <ErrorState error={r.error} />;
  const f = r.value;
  const appUrl = (process.env.APP_URL || "https://oppllo-one.vercel.app").replace(/\/$/, "");
  return (
    <div className="max-w-2xl space-y-4">
      <BackLink fallback="/requests" />
      <PageHeader
        title={f.name}
        description={f.description ?? undefined}
        actions={
          f.canManage ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/requests/${f.id}/edit` as Route}>Edit form</Link>
            </Button>
          ) : null
        }
      />
      {f.canManage ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            Tasks go to {f.clientName} · {f.projectName}. {f.submissions} {f.submissions === 1 ? "request" : "requests"} so far.
          </p>
          {f.publicSlug ? (
            <p className="flex flex-wrap items-center gap-2">
              Public link: <span className="font-mono break-all text-foreground select-all">{`${appUrl}/r/${f.publicSlug}`}</span>
              <CopyButton text={`${appUrl}/r/${f.publicSlug}`} label="Copy link" />
            </p>
          ) : null}
        </div>
      ) : null}
      {f.active ? (
        <Card>
          <CardContent className="pt-4">
            <FillForm questions={f.questions} action={submitRequestAction} hidden={{ formId: f.id }} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">This form is closed.</p>
      )}
    </div>
  );
}
