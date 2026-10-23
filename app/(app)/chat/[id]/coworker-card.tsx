"use client";

// An AI co-worker card in the chat (Stage 12.5): what it noticed, why (the facts), and the change it proposes. Approve
// runs it as you (if you couldn't make that change yourself, it says so); Change lets you pick another person, date,
// title or wording first; Dismiss; Snooze. Nothing changes until someone approves.
import { useState } from "react";
import { AlarmClock, Bot, Check, ChevronDown, Loader2, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatShortDate } from "@/lib/format";
import type { CardAction } from "@/repositories";
import type { CardView } from "@/services/coworker";
import { approveCardAction, dismissCardAction, snoozeCardAction } from "../actions";

const describe = (a: CardAction) =>
  a.type === "reassign"
    ? `Give “${a.taskTitle}” to ${a.personName}`
    : a.type === "move_date"
      ? `Move “${a.taskTitle}” to ${formatShortDate(a.date)}`
      : a.type === "create_task"
        ? `Create a task: “${a.title}”${a.dueDate ? `, due ${formatShortDate(a.dueDate)}` : ""}`
        : a.type === "ping"
          ? `Post in this chat: ${a.text}`
          : `Flag to the owner: ${a.text}`;

const STATUS: Record<string, string> = { approved: "Approved", partly: "Approved, with some changes not made", dismissed: "Dismissed", snoozed: "Snoozed" };

export function CoworkerCard({ initial, people }: { initial: CardView; people: Array<{ id: string; name: string }> }) {
  const [card, setCard] = useState(initial);
  const [why, setWhy] = useState(false);
  const [editing, setEditing] = useState<CardAction[] | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (run: () => Promise<{ ok: true; value: CardView } | { ok: false; message: string }>) => {
    setBusy(true);
    setError(null);
    const r = await run();
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setCard(r.value);
    setEditing(null);
    setSnoozing(false);
  };
  const edit = (i: number, patch: Partial<CardAction>) => setEditing((cur) => cur!.map((a, j) => (j === i ? ({ ...a, ...patch } as CardAction) : a)));
  const open = card.status === "open";
  const many = card.actions.length > 1;

  return (
    <div className="mt-1 space-y-2 rounded-lg border border-primary/30 bg-accent/40 p-3">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">
          <Bot className="size-3" /> AI co-worker
        </Badge>
        <span className="text-xs text-muted-foreground">{card.kindLabel}</span>
      </p>
      <p className="text-sm font-medium">{card.wording ?? card.title}</p>
      <ul className="space-y-1 text-sm">
        {(editing ?? card.actions).map((a, i) => (
          <li key={i} className="flex flex-col gap-1">
            {editing ? (
              a.type === "reassign" ? (
                <label className="flex flex-wrap items-center gap-2 text-xs">
                  Give “{a.taskTitle}” to
                  <Select value={a.personId} onChange={(e) => edit(i, { personId: e.target.value, personName: people.find((p) => p.id === e.target.value)?.name ?? "" })} className="h-8 w-48">
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : a.type === "move_date" ? (
                <label className="flex flex-wrap items-center gap-2 text-xs">
                  Move “{a.taskTitle}” to
                  <Input type="date" value={a.date} onChange={(e) => edit(i, { date: e.target.value })} className="h-8 w-40" />
                </label>
              ) : a.type === "create_task" ? (
                <Input value={a.title} onChange={(e) => edit(i, { title: e.target.value })} aria-label="Task title" className="h-8" />
              ) : (
                <Textarea value={a.text} onChange={(e) => edit(i, { text: e.target.value })} rows={2} aria-label="Message" />
              )
            ) : (
              <span>
                {many ? "• " : "→ "}
                {describe(a)}
                {card.results?.[i] ? <span className={card.results[i]!.ok ? "text-success" : "text-danger"}> · {card.results[i]!.message}</span> : null}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setWhy(!why)} aria-expanded={why} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={why ? "size-3.5 rotate-180" : "size-3.5"} /> Why?
      </button>
      {why ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {card.why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {open ? (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => act(() => approveCardAction(card.id, editing ?? undefined))}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} {editing ? "Approve changes" : many ? `Approve all (${card.actions.length})` : "Approve"}
          </Button>
          {editing ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(card.actions)}>
              <Pencil /> Change
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => dismissCardAction(card.id))}>
            <X /> Dismiss
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSnoozing(!snoozing)} aria-expanded={snoozing}>
            <AlarmClock /> Snooze
          </Button>
          {snoozing ? (
            <span className="flex basis-full flex-wrap gap-1.5">
              {(
                [
                  ["monday", "Remind me Monday"],
                  ["3_days", "In 3 days"],
                  ["client_reply", "After the client replies"],
                ] as const
              ).map(([until, label]) => (
                <Button key={until} size="sm" variant="outline" disabled={busy} onClick={() => act(() => snoozeCardAction(card.id, until))}>
                  {label}
                </Button>
              ))}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {STATUS[card.status] ?? card.status}
          {card.status === "snoozed" && card.snoozedUntil ? ` until ${card.wakeOnClientReply ? "the client replies, or " : ""}${formatShortDate(card.snoozedUntil)}` : ""}
        </p>
      )}
    </div>
  );
}
