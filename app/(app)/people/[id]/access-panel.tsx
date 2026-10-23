"use client";

// The access register and joining/exit checklists for one person (HR slice 2). HR and the owner change them; the
// person sees their own. Never store passwords here.
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Check, KeyRound, Plus } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { formatShortDate } from "@/lib/format";
import type { ChecklistKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ChecklistItemRecord } from "@/repositories";
import type { PersonAccess } from "@/services/access";
import { addChecklistItemAction, checklistDoneAction, grantAccessAction, removeChecklistItemAction, revokeAccessAction, startChecklistAction } from "../actions";

/** Tools the team uses most, offered as you type (any name works). */
const SYSTEMS = ["Google Workspace", "Meta Business Manager", "Google Ads", "Canva", "ClickUp", "Figma", "WordPress", "WhatsApp Business", "Zoho", "Oppllo One"];

export function AccessPanel({ personId, data, today, active, self }: { personId: string; data: PersonAccess; today: string; active: boolean; self: boolean }) {
  const [adding, setAdding] = useState(false);
  const open = data.access.filter((a) => !a.revokedOn);
  const closed = data.access.filter((a) => a.revokedOn);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-muted-foreground" /> Access
          </h2>
          <p className="text-xs text-muted-foreground">Which tools and client accounts {self ? "you have" : "they have"}. No passwords here, ever.</p>
        </div>
        {data.canManage && active && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add
          </Button>
        ) : null}
      </div>
      {adding ? <GrantForm personId={personId} clients={data.clients ?? []} today={today} onDone={() => setAdding(false)} /> : null}
      {data.access.length === 0 ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p> : null}
      <ul className="divide-y">
        {[...open, ...closed].map((a) => (
          <li key={a.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm", a.revokedOn && "text-muted-foreground")}>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", a.revokedOn && "line-through decoration-1")}>
                {a.system}
                {a.account ? <span className="font-normal text-muted-foreground"> · {a.account}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {[a.level, a.clientName, `since ${formatShortDate(a.grantedOn)}`, a.revokedOn ? `removed ${formatShortDate(a.revokedOn)}` : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            {data.canManage && !a.revokedOn ? (
              <ConfirmForm
                action={revokeAccessAction}
                fields={{ grantId: a.id }}
                label="Mark removed"
                ariaLabel={`Mark ${a.system}${a.account ? ` (${a.account})` : ""} removed`}
                variant="ghost"
                confirm={`Mark ${a.system}${a.account ? ` (${a.account})` : ""} as removed today?`}
                showSuccess={false}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GrantForm({ personId, clients, today, onDone }: { personId: string; clients: Array<{ id: string; name: string }>; today: string; onDone: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof grantAccessAction>[0], form: FormData) => {
    const next = await grantAccessAction(prev, form);
    if (next.status === "ok") onDone();
    return next;
  }, idle);
  const f = (name: string, initial: string) => ({ id: `grant-${name}`, name, defaultValue: fieldDefault(state, name, initial), ...invalidProps(state, name, `grant-${name}`) });
  return (
    <form action={action} className="grid gap-3 rounded-md bg-subtle p-3 sm:grid-cols-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <input type="hidden" name="personId" value={personId} />
      <Field label="Tool" name="system" htmlFor="grant-system" state={state}>
        <Input {...f("system", "")} list="grant-systems" required maxLength={80} placeholder="e.g. Meta Business Manager" className="h-8" />
        <datalist id="grant-systems">
          {SYSTEMS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Account" name="account" htmlFor="grant-account" state={state}>
        <Input {...f("account", "")} maxLength={120} placeholder="e.g. Zenith IAS ad account" className="h-8" />
      </Field>
      <Field label="Client (for a client's own account)" name="clientId" htmlFor="grant-clientId" state={state}>
        <Select {...f("clientId", "")} className="h-8">
          <option value="">Oppllo&apos;s own</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Level" name="level" htmlFor="grant-level" state={state}>
          <Input {...f("level", "")} maxLength={40} placeholder="Admin" className="h-8" />
        </Field>
        <Field label="Since" name="grantedOn" htmlFor="grant-grantedOn" state={state}>
          <Input {...f("grantedOn", today)} type="date" max={today} required className="h-8" />
        </Field>
      </div>
      {state.status === "error" ? <FormStatus state={state} className="sm:col-span-2" /> : null}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton size="sm" pendingLabel="Saving…">
          Record access
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const TITLES: Record<ChecklistKind, string> = { joining: "Joining checklist", exit: "Exit checklist" };

export function ChecklistPanel({ personId, data, active }: { personId: string; data: PersonAccess; active: boolean }) {
  const kinds: ChecklistKind[] = data.checklists.exit.length ? ["exit", "joining"] : ["joining", "exit"];
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card">
      {kinds.map((kind) => {
        const items = data.checklists[kind];
        if (items.length === 0) {
          if (!data.canManage || !active || (kind === "joining" && data.checklists.exit.length)) return null;
          return <StartChecklist key={kind} personId={personId} kind={kind} />;
        }
        return <Checklist key={kind} personId={personId} kind={kind} items={items} canManage={data.canManage} />;
      })}
    </section>
  );
}

function StartChecklist({ personId, kind }: { personId: string; kind: ChecklistKind }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold">{TITLES[kind]}</h2>
        <p className="text-xs text-muted-foreground">
          {kind === "exit" ? "Lists every access, client and open task to hand over. It also starts by itself when their exit is recorded." : "Not started. New people get it automatically."}
        </p>
      </div>
      <ConfirmForm action={startChecklistAction} fields={{ personId, kind }} label={`Start ${kind === "exit" ? "exit" : "joining"} checklist`} showSuccess={false} />
    </div>
  );
}

function Checklist({ personId, kind, items, canManage }: { personId: string; kind: ChecklistKind; items: ChecklistItemRecord[]; canManage: boolean }) {
  // Ticks show at once; the server confirms (and revokes access for an exit step) behind.
  const [optimistic, setDone] = useOptimistic(items, (list, change: { id: string; done: boolean }) =>
    list.map((i) => (i.id === change.id ? { ...i, doneAt: change.done ? new Date() : null } : i)),
  );
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const done = optimistic.filter((i) => i.doneAt).length;
  const [state, add] = useActionState(addChecklistItemAction, idle);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{TITLES[kind]}</h2>
        <Badge tone={done === optimistic.length ? "success" : "neutral"}>
          {done} of {optimistic.length}
        </Badge>
      </div>
      <ul className="space-y-1">
        {optimistic.map((i) => (
          <li key={i.id} className="group flex items-start gap-2 text-sm">
            {/* A 32px tap target around a 20px box. */}
            <button
              type="button"
              role="checkbox"
              aria-checked={Boolean(i.doneAt)}
              disabled={!canManage}
              aria-label={i.title}
              onClick={() =>
                start(async () => {
                  setDone({ id: i.id, done: !i.doneAt });
                  const r = await checklistDoneAction({ itemId: i.id, done: !i.doneAt });
                  setError(r.ok ? null : r.message);
                })
              }
              className="group/tick -my-1.5 -ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-md disabled:opacity-60"
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded border-2",
                  i.doneAt ? "border-success bg-success text-primary-foreground" : "border-border-strong group-hover/tick:border-success",
                )}
              >
                {i.doneAt ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
            </button>
            <span className={cn("min-w-0 flex-1", i.doneAt && "text-muted-foreground line-through decoration-1")}>
              {i.title}
              {i.doneAt && i.doneByName ? <span className="text-xs no-underline"> · {i.doneByName}</span> : null}
            </span>
            {canManage && !i.source?.startsWith("access:") ? (
              // Hover-to-show on desktop only: phones and tablets have no hover, so it's always there.
              <span className="md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                <ConfirmForm
                  action={removeChecklistItemAction}
                  fields={{ itemId: i.id }}
                  label="Remove"
                  ariaLabel={`Remove the step “${i.title}”`}
                  confirm={`Remove the step “${i.title}”?`}
                  variant="ghost"
                  showSuccess={false}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {canManage ? (
        <form action={add} className="flex flex-wrap items-center gap-2 pl-7" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="kind" value={kind} />
          <Input
            id={`step-${kind}`}
            name="title"
            aria-label={`Add a step to the ${kind} checklist`}
            placeholder="Add a step…"
            maxLength={200}
            required
            defaultValue={fieldDefault(state, "title", "")}
            className="h-8 min-w-0 flex-1"
            {...invalidProps(state, "title", `step-${kind}`)}
          />
          <SubmitButton size="sm" variant="ghost" aria-label={`Add the step to the ${kind} checklist`}>
            <Plus />
          </SubmitButton>
          {state.status === "error" ? (
            <span id={`step-${kind}-error`} className="basis-full text-xs text-danger">
              {state.fieldErrors?.title?.[0] ?? state.message}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
