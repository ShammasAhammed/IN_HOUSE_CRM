// AI apps connected to Oppllo One through the MCP (Stage 9.3, D87), with a way to disconnect each.
import { Plug } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { ErrorState } from "@/components/states";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import type { McpConnectionRecord } from "@/repositories";
import { disconnectAppAction } from "@/app/(app)/me/actions";

function Row({ c, showPerson }: { c: McpConnectionRecord; showPerson: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="font-medium">{c.clientName}</span>
        {showPerson ? <span className="text-muted-foreground"> · {c.personName}</span> : null}
        <span className="block text-xs text-muted-foreground">
          Connected {formatDateTime(c.createdAt)}
          {c.lastUsedAt ? ` · last used ${formatDateTime(c.lastUsedAt)}` : " · not used yet"}
        </span>
      </span>
      <ConfirmForm action={disconnectAppAction} fields={{ connectionId: c.id }} confirm={`Disconnect ${c.clientName}? It stops working at once.`} label="Disconnect" pendingLabel="Disconnecting…" ariaLabel={`Disconnect ${c.clientName}`} />
    </li>
  );
}

/** `everyone`: the owner's view in Settings → AI; otherwise the person's own apps on My page. */
export async function ConnectedApps({ everyone = false }: { everyone?: boolean }) {
  const actor = await requireActor();
  const r = await getServices().mcpAuth.connections(actor);
  if (!r.ok) return <ErrorState error={r.error} />;
  const list = everyone ? [...r.value.mine, ...r.value.others] : r.value.mine;
  return (
    <section className="space-y-2" aria-label="Connected AI apps">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Plug className="size-4 text-muted-foreground" /> Connected AI apps
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {everyone ? "Nobody has connected an AI app yet." : "None. To use Oppllo One from Claude, add it as a connector (the owner has the steps)."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-card">
          {list.map((c) => (
            <Row key={c.id} c={c} showPerson={everyone} />
          ))}
        </ul>
      )}
    </section>
  );
}
