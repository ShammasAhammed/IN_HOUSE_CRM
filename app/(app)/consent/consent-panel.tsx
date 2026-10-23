// DPDP consent on a lead's or a person's page (Stage 11.7): what was agreed, when and how, and any withdrawal.
import { ShieldCheck } from "lucide-react";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { formatDate, formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { CONSENT_METHOD_LABELS, type ConsentSubject } from "@/lib/types";
import { RecordConsentForm, WithdrawConsentForm } from "./consent-forms";

const DEFAULT_PURPOSE: Record<ConsentSubject, string> = {
  lead: "Calls, WhatsApp and email about admissions",
  person: "Keep my personal and HR details for employment",
  client_contact: "Use the Oppllo client portal",
};

export async function ConsentPanel({ subjectType, subjectId }: { subjectType: ConsentSubject; subjectId: string }) {
  const actor = await requireActor();
  const r = await getServices().consent.forSubject(actor, subjectType, subjectId);
  if (!r.ok) return r.error.code === "not_found" ? null : <ErrorState error={r.error} />;
  const { records, canRecord } = r.value;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" /> Consent
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No consent recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {records.map((c) => (
              <li key={c.id} className="space-y-1.5 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium">{c.purpose}</span>
                  <Badge tone={c.withdrawnAt ? "neutral" : "success"}>{c.withdrawnAt ? "Withdrawn" : "Given"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {CONSENT_METHOD_LABELS[c.method]} · {formatDate(istDate(c.givenAt))} · {c.recordedByName ? `recorded by ${c.recordedByName}` : "from the landing-page form"}
                  {c.note ? ` · ${c.note}` : ""}
                </p>
                {c.withdrawnAt && c.withdrawnMethod ? (
                  <p className="text-xs text-muted-foreground">
                    Withdrawn {formatDateTime(c.withdrawnAt)} by {CONSENT_METHOD_LABELS[c.withdrawnMethod].toLowerCase()}
                    {c.withdrawnByName ? `, recorded by ${c.withdrawnByName}` : ""}
                    {c.withdrawnNote ? ` · ${c.withdrawnNote}` : ""}
                  </p>
                ) : null}
                {c.canWithdraw ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-primary">Record a withdrawal</summary>
                    <div className="mt-2">
                      <WithdrawConsentForm consentId={c.id} />
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canRecord ? (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Record consent</summary>
            <div className="mt-3">
              <RecordConsentForm subjectType={subjectType} subjectId={subjectId} today={istDate()} defaultPurpose={DEFAULT_PURPOSE[subjectType]} />
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
