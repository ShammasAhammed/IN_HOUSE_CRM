// Settings → Trust (Stage 11.7, owner): are backups running and checked, does anyone hear about errors, how much
// consent is on record, and the way into the audit log.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DatabaseBackup, ScrollText, ShieldAlert, ShieldCheck } from "lucide-react";
import { ErrorState, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, formatDateTime, formatFileSize } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { errorReporterStatus } from "@/lib/server/report-error";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Trust" };

export default function TrustPage() {
  return (
    <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading" />}>
      <Trust />
    </Suspense>
  );
}

async function Trust() {
  const actor = await requireActor();
  const services = getServices();
  const [backups, consent] = await Promise.all([services.backups.status(actor), services.consent.counts(actor)]);
  if (!backups.ok) return <ErrorState error={backups.error} />;
  if (!consent.ok) return <ErrorState error={consent.error} />;
  const b = backups.value;
  const last = b.runs[0];
  const lastGood = b.runs.find((r) => r.status === "ok");
  const errors = errorReporterStatus();
  const c = consent.value;
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseBackup className="size-4 text-muted-foreground" /> Backups
          </CardTitle>
          <Badge tone={!b.connected ? "warning" : last?.status === "ok" ? "success" : "danger"}>{!b.connected ? "Not set up" : last ? (last.status === "ok" ? "Working" : "Last run failed") : "Waiting for the first run"}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!b.connected ? (
            <>
              <p>Backups: not set up yet. The database host (Neon) keeps its own short history, but there is no copy in storage you own.</p>
              <p className="text-muted-foreground">
                What&apos;s needed: choose where backups go (Cloudflare R2, Google Drive, or S3 / Backblaze B2; see docs/backups.md in the code), create that account, and give the
                developer its keys. Then every night the whole database is copied there, read back to check it, and kept {b.keepDays} days.
              </p>
            </>
          ) : (
            <>
              <p>
                Stored in <span className="font-medium">{b.storage}</span>, every night, kept {b.keepDays} days.
              </p>
              {lastGood ? (
                <p>
                  Last good backup {formatDateTime(lastGood.startedAt)}: {lastGood.sizeBytes ? formatFileSize(lastGood.sizeBytes) : "—"}, {formatCount(lastGood.tables ?? 0)} tables,{" "}
                  {formatCount(lastGood.rows ?? 0)} rows, read back and checked.
                </p>
              ) : (
                <p className="text-danger">No good backup yet.</p>
              )}
              {b.runs.length ? (
                <ul className="divide-y rounded-md border">
                  {b.runs.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <span className="tabular text-xs text-muted-foreground">{formatDateTime(r.startedAt)}</span>
                      <Badge tone={r.status === "ok" ? "success" : "danger"}>{r.status === "ok" ? "Checked" : "Failed"}</Badge>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{r.message ?? (r.sizeBytes ? formatFileSize(r.sizeBytes) : "")}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" /> Error alerts
          </CardTitle>
          <Badge tone={errors.connected ? "success" : "warning"}>{errors.connected ? errors.label : "Not connected"}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {errors.connected ? (
            <p>Unexpected errors are sent to {errors.label} and to the server log.</p>
          ) : (
            <p>
              Not connected: unexpected errors only reach the server log (Vercel), so nobody is alerted. Once an alert service (Sentry or similar) is chosen, it is
              added in one place.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" /> Consent on record
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            {(
              [
                ["Leads", c.lead],
                ["Team", c.person],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-md bg-subtle px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="tabular text-base font-semibold">
                  {formatCount(n.active)} given
                  <span className="block text-xs font-normal text-muted-foreground">{formatCount(n.withdrawn)} withdrawn</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Recorded on each lead and person page. Landing-page forms with a ticked consent box record it on their own.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" /> Audit log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Every change anyone made, who and when, kept for good.</p>
          <Link href="/settings/audit" className="text-primary hover:underline">
            Open the audit log
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
