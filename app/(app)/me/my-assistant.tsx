// My page → My assistant (Stage 12.4): my promises, my week, and which parts of my assistant are on. Only mine.
import { Handshake, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinutes, formatShortDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { ASSISTANT_PARTS, type AssistantPart } from "@/services/my-assistant";
import { setAssistantPartAction } from "./assistant-actions";
import { PromiseItem, WriteUp } from "./my-assistant-forms";

const PART_LABELS: Record<AssistantPart, string> = {
  plan: "Morning plan on My Day",
  drafts: "Draft reply buttons",
  promises: "Spot promises in my messages",
  reports: "Help with my reports",
};

export async function MyAssistant() {
  const actor = await requireActor();
  const services = getServices();
  const [status, mine, week] = await Promise.all([services.myAssistant.status(actor), services.myAssistant.promises(actor), services.myAssistant.week(actor)]);
  return (
    <section aria-label="My assistant" className="space-y-4 rounded-lg border bg-card p-4 shadow-card">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> My assistant
        </h2>
        <p className="text-xs text-muted-foreground">It only suggests; nothing happens until you click. Only you see your promises, drafts and summaries.</p>
        {status.aiReason ? <p className="mt-1 text-xs text-muted-foreground">{status.aiReason} The plan, promises list and weekly list still work.</p> : null}
      </div>

      <div id="promises" className="scroll-mt-16 space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Handshake className="size-4 text-muted-foreground" /> Things I said I would do
        </h3>
        {mine.promises.length ? (
          <ul className="divide-y rounded-md border">
            {mine.promises.map((p) => (
              <PromiseItem key={p.id} promise={{ id: p.id, excerpt: p.excerpt, link: p.link, dueOn: p.dueOn, status: p.status, remindOn: p.remindOn }} projects={mine.projects} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{status.prefs.promises ? "None right now. When you write something like “I'll send it tomorrow”, it shows here." : "Switched off below."}</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          What did I do this week? <span className="text-xs font-normal text-muted-foreground">{formatShortDate(week.from)} to {formatShortDate(week.to)}</span>
        </h3>
        {week.clients.length ? (
          <ul className="space-y-1 text-sm">
            {week.clients.map((c) => (
              <li key={c.clientName}>
                <span className="font-medium">{c.clientName}</span>
                <span className="text-muted-foreground"> · {formatMinutes(c.minutes)}</span>
                {c.tasks.length ? <span className="block text-xs text-muted-foreground">{c.tasks.slice(0, 8).join(" · ")}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing done or logged yet this week.</p>
        )}
        {week.clients.length && status.prefs.reports && !status.aiReason ? <WriteUp kind="week" /> : null}
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <h3 className="text-sm font-medium">Parts of my assistant</h3>
        <ul className="divide-y">
          {ASSISTANT_PARTS.map((part) => (
            <li key={part} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              {PART_LABELS[part]}
              <form action={setAssistantPartAction} className="flex items-center gap-2">
                <input type="hidden" name="part" value={part} />
                {status.prefs[part] ? null : <input type="hidden" name="on" value="on" />}
                <span className="text-xs text-muted-foreground">{status.prefs[part] ? "On" : "Off"}</span>
                <Button type="submit" size="sm" variant="outline" aria-label={`${status.prefs[part] ? "Turn off" : "Turn on"}: ${PART_LABELS[part]}`}>
                  {status.prefs[part] ? "Turn off" : "Turn on"}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
