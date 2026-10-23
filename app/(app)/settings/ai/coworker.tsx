// Settings → AI → AI co-worker (Stage 12.5): on/off for everyone, per client or space and per kind of suggestion; its
// own monthly cap; the Monday digest and setup nudges; kinds that went quiet; how often each kind is accepted.
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatRupees } from "@/lib/format";
import type { CoworkerService } from "@/services/coworker";
import { DEFAULT_COWORKER_CAP_PAISE } from "@/services/coworker";
import { COWORKER_KIND_LABELS, COWORKER_KINDS, type CoworkerKind } from "@/services/rules/coworker";
import { coworkerAction } from "../actions";

type Page = Extract<Awaited<ReturnType<CoworkerService["page"]>>, { ok: true }>["value"];

function Toggle({ on, values, label }: { on: boolean; values: Record<string, string>; label: string }) {
  return (
    <form action={coworkerAction} className="flex items-center gap-2">
      {Object.entries(values).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {on ? null : <input type="hidden" name="on" value="on" />}
      <span className="text-xs text-muted-foreground">{on ? "On" : "Off"}</span>
      <Button type="submit" size="sm" variant="outline" aria-label={`${on ? "Turn off" : "Turn on"}: ${label}`}>
        {on ? "Turn off" : "Turn on"}
      </Button>
    </form>
  );
}

export function CoworkerSection({ page }: { page: Page }) {
  const s = page.settings;
  const name = new Map(page.clients.map((c) => [c.id, c.name]));
  const off = new Set(s.offClients ?? []);
  const cap = s.capPaise ?? DEFAULT_COWORKER_CAP_PAISE;
  return (
    <section aria-label="AI co-worker" className="space-y-3">
      <h2 className="text-sm font-semibold">AI co-worker</h2>
      <p className="text-sm text-muted-foreground">
        Once a day it looks at every client and space and posts suggestions in their chat: late or blocked work, work with no owner, an owner on leave, someone overloaded, creatives waiting on the client, quiet clients, results behind, empty content calendars. Nothing changes until someone approves, and only someone who could make that change can approve it. It never touches money, HR, access or the client portal, and never messages clients.
      </p>
      <div className="divide-y rounded-lg border bg-card px-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          AI co-worker for everyone <Toggle on={s.on !== false} values={{ op: "on" }} label="AI co-worker" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          Monday client health digest for the owner <Toggle on={s.digest !== false} values={{ op: "digest" }} label="Monday digest" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          Weekly setup nudges to lead strategists <Toggle on={s.nudges !== false} values={{ op: "nudges" }} label="Setup nudges" />
        </div>
        <form action={coworkerAction} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <input type="hidden" name="op" value="cap" />
          <span>
            Monthly cap for its wording <span className="text-xs text-muted-foreground">({formatRupees(page.spentPaise)} used this month; without the AI, cards use plain wording)</span>
          </span>
          <span className="flex items-center gap-2">
            ₹<Input name="rupees" inputMode="numeric" defaultValue={String(cap / 100)} aria-label="Monthly cap in rupees" className="h-8 w-24" />
            <Button type="submit" size="sm" variant="outline">
              Save
            </Button>
          </span>
        </form>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-card">
        <h3 className="mb-2 text-sm font-semibold">Kinds of suggestion, and how often each is accepted</h3>
        <ul className="divide-y text-sm">
          {COWORKER_KINDS.map((k) => {
            const r = page.rates.find((x) => x.kind === k);
            const total = (r?.approved ?? 0) + (r?.dismissed ?? 0);
            return (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1">
                  {COWORKER_KIND_LABELS[k]}
                  <span className="block text-xs text-muted-foreground">{total ? `${Math.round(((r?.approved ?? 0) * 100) / total)}% approved (${r?.approved} of ${total})` : "No answers yet"}</span>
                </span>
                <Toggle on={!(s.offKinds ?? []).includes(k)} values={{ op: "kind", kind: k }} label={COWORKER_KIND_LABELS[k]} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2 rounded-lg border bg-card p-4 shadow-card">
        <h3 className="text-sm font-semibold">Clients and spaces it leaves alone</h3>
        {off.size ? (
          <ul className="divide-y text-sm">
            {[...off].map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 py-2">
                {name.get(id) ?? "A client"}
                <Toggle on={false} values={{ op: "client", clientId: id }} label={name.get(id) ?? "client"} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None: it looks at every active client and space.</p>
        )}
        <form action={coworkerAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="op" value="client" />
          <Select name="clientId" defaultValue="" required aria-label="Client or space to leave alone" className="h-8 min-w-0 flex-1 sm:w-64 sm:flex-none">
            <option value="" disabled>
              Leave a client or space alone…
            </option>
            {page.clients
              .filter((c) => !off.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
          <Button type="submit" size="sm" variant="outline">
            Turn off there
          </Button>
        </form>
      </div>

      {Object.keys(s.quiet ?? {}).length ? (
        <div className="space-y-2 rounded-lg border bg-card p-4 shadow-card">
          <h3 className="text-sm font-semibold">Gone quiet after many dismissals</h3>
          <ul className="divide-y text-sm">
            {Object.entries(s.quiet ?? {}).map(([key, day]) => {
              const [clientId, kind] = key.split(":");
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {COWORKER_KIND_LABELS[kind as CoworkerKind] ?? kind} for {name.get(clientId!) ?? "a client"}
                    <span className="block text-xs text-muted-foreground">Since {day}</span>
                  </span>
                  <form action={coworkerAction}>
                    <input type="hidden" name="op" value="unquiet" />
                    <input type="hidden" name="key" value={key} />
                    <Button type="submit" size="sm" variant="outline">
                      Turn back on
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
