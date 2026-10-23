"use client";

// My assistant's clicks (Stage 12.4): settle a promise, and write up my week or my self-review for me to edit and copy.
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Bell, Check, ListPlus, Loader2, Sparkles, X } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { FormStatus } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { formatRupees, formatShortDate } from "@/lib/format";
import { decidePromiseAction, selfReviewAction, weekWriteUpAction } from "./assistant-actions";

type PromiseView = { id: string; excerpt: string; link: string; dueOn: string | null; status: string; remindOn: string | null };

export function PromiseItem({ promise: p, projects }: { promise: PromiseView; projects: Array<{ id: string; name: string; clientName: string }> }) {
  const [state, action] = useActionState(decidePromiseAction, idle);
  const [open, setOpen] = useState<"remind" | "task" | null>(null);
  const hidden = (a: string) => (
    <>
      <input type="hidden" name="promiseId" value={p.id} />
      <input type="hidden" name="action" value={a} />
    </>
  );
  return (
    <li className="space-y-2 px-3 py-2.5">
      <p className="text-sm">
        <Link href={p.link as Route} className="hover:underline">
          &ldquo;{p.excerpt}&rdquo;
        </Link>
        <span className="block text-xs text-muted-foreground">
          {p.dueOn ? `Due ${formatShortDate(p.dueOn)}` : "No day said"}
          {p.status === "reminder" && p.remindOn ? ` · reminder on ${formatShortDate(p.remindOn)}` : ""}
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {p.status === "open" ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(open === "remind" ? null : "remind")}>
            <Bell /> Remind me
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setOpen(open === "task" ? null : "task")}>
          <ListPlus /> Make it a task
        </Button>
        <form action={action}>
          {hidden("kept")}
          <Button type="submit" size="sm" variant="ghost">
            <Check /> Done
          </Button>
        </form>
        <form action={action}>
          {hidden("dismiss")}
          <Button type="submit" size="sm" variant="ghost" aria-label="Not a promise: remove it">
            <X /> Not a promise
          </Button>
        </form>
      </div>
      {open === "remind" ? (
        <form action={action} className="flex flex-wrap items-center gap-2">
          {hidden("remind")}
          <Input type="date" name="date" defaultValue={p.dueOn ?? ""} aria-label="Remind me on" className="h-8 w-40" />
          <Button type="submit" size="sm">
            Set reminder
          </Button>
        </form>
      ) : null}
      {open === "task" ? (
        <form action={action} className="flex flex-wrap items-center gap-2">
          {hidden("task")}
          <Input name="title" defaultValue={p.excerpt.slice(0, 200)} aria-label="Task title" className="h-8 min-w-0 flex-1" />
          <Select name="projectId" defaultValue="" required aria-label="Project" className="h-8 w-56">
            <option value="" disabled>
              Pick a project…
            </option>
            {projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.clientName} · {pr.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            Add task
          </Button>
        </form>
      ) : null}
      <FormStatus state={state} />
    </li>
  );
}

/** "Write it up": the week as a paragraph, or this month's self-review. A draft to edit and copy; never saved or sent. */
export function WriteUp({ kind }: { kind: "week" | "review" }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const r = kind === "week" ? await weekWriteUpAction() : await selfReviewAction();
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setText(r.value.text);
    setCost(r.value.costPaise);
  };
  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {kind === "week" ? "Write it up" : "Draft my self-review for this month"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {text !== null ? (
        <div className="space-y-1.5">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={kind === "week" ? 5 : 10} aria-label={kind === "week" ? "My week" : "My self-review draft"} />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CopyButton text={text} />A draft for you: edit it, copy it, nothing is saved or sent.{cost !== null ? ` · ${formatRupees(cost)}` : ""}
          </div>
        </div>
      ) : null}
    </div>
  );
}
