// The client's Drive folder and Zoho Books invoices (ops extras). Shown only to those who may use them.
import { FolderOpen, ReceiptText } from "lucide-react";
import { ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatRupees } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { InvoiceForm, MakeFolder } from "./billing-forms";

export async function Billing({ clientId }: { clientId: string }) {
  const actor = await requireActor();
  const r = await getServices().billing.panel(actor, clientId);
  if (!r.ok) return <ErrorState error={r.error} />;
  const { drive, invoices } = r.value;
  return (
    <>
      {drive.url || drive.canMake ? (
        <Card>
          <CardHeader>
            <CardTitle>Drive folder</CardTitle>
            <FolderOpen className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-2">
            {drive.url ? (
              <a href={drive.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                Open in Google Drive
              </a>
            ) : (
              <MakeFolder clientId={clientId} />
            )}
          </CardContent>
        </Card>
      ) : null}
      {invoices ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <ReceiptText className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {invoices.list.length ? (
              <ul className="divide-y text-sm">
                {invoices.list.map((i) => (
                  <li key={i.id} className="py-2">
                    <div className="flex justify-between gap-2">
                      <a href={i.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                        {i.number}
                      </a>
                      <span className="tabular">{formatRupees(i.amountPaise)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(i.invoiceDate)} · {i.description}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No invoices made from here yet.</p>
            )}
            {invoices.canCreate ? <InvoiceForm clientId={clientId} /> : !invoices.connected ? <p className="text-xs text-muted-foreground">Zoho Books isn&apos;t connected yet. The owner connects it.</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
