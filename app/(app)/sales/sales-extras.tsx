"use client";

// WhatsApp templates on a lead, saved views on the Leads screen, and the templates editor (Stage 10b).
import Link from "next/link";
import type { Route } from "next";
import { useActionState, useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import type { LeadView, MessageTemplate } from "@/repositories";
import { removeViewAction, saveViewAction, templatesAction, whatsappAction } from "./lead-actions";

export function WhatsAppMenu({ leadId, templates }: { leadId: string; templates: MessageTemplate[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
        {templates.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={async () => {
              setError(null);
              setBusy(t.id);
              // Open the tab now, while the click counts as the person's: browsers block windows opened later.
              const w = window.open("about:blank", "_blank");
              const r = await whatsappAction(leadId, t.id);
              setBusy(null);
              if (r.ok && w) w.location.href = r.url;
              else {
                w?.close();
                setError(r.ok ? "Allow pop-ups for Oppllo One to open WhatsApp." : r.message);
              }
            }}
          >
            {busy === t.id ? "Opening…" : t.name}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SavedViews({ views, query }: { views: LeadView[]; query: string }) {
  const [adding, setAdding] = useState(false);
  const [state, action] = useActionState(saveViewAction, idle);
  const [, remove] = useActionState(removeViewAction, idle);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center rounded-md border bg-card text-sm">
          <Link href={`/sales/leads?${v.query}` as Route} className={`rounded-l-md px-2.5 py-1 hover:bg-hover ${v.query === query ? "bg-accent font-medium text-accent-foreground" : ""}`}>
            {v.name}
          </Link>
          <form action={remove}>
            <input type="hidden" name="viewId" value={v.id} />
            <button type="submit" aria-label={`Remove the view ${v.name}`} className="rounded-r-md px-1.5 py-1 text-muted-foreground hover:bg-hover hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </form>
        </span>
      ))}
      {adding ? (
        <form action={action} key={state.status} className="flex items-center gap-1.5">
          <input type="hidden" name="query" value={query} />
          <Input name="name" aria-label="View name" required maxLength={40} placeholder="e.g. Hot NEET leads" className="h-8 w-44" autoFocus />
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          {state.status === "error" ? <FormStatus state={state} /> : null}
        </form>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={!query || query === "stage=open"}>
          <Plus /> Save this view
        </Button>
      )}
    </div>
  );
}

export function TemplatesForm({ templates }: { templates: MessageTemplate[] }) {
  const [state, action] = useActionState(templatesAction, idle);
  const [rows, setRows] = useState(Math.min(10, templates.length + 1));
  return (
    <form action={action} className="space-y-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <p className="text-sm text-muted-foreground">
        Ready-made WhatsApp messages on each lead. <code className="text-xs">{"{name}"}</code>, <code className="text-xs">{"{institution}"}</code> and{" "}
        <code className="text-xs">{"{me}"}</code> are filled in. Leave a name empty to remove a template.
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid gap-2 rounded-lg border bg-card p-3 shadow-card sm:grid-cols-[12rem_1fr]">
          <input type="hidden" name={`id${i}`} defaultValue={templates[i]?.id ?? ""} />
          <Input name={`name${i}`} aria-label={`Template ${i + 1} name`} maxLength={40} placeholder="Name" defaultValue={fieldDefault(state, `name${i}`, templates[i]?.name ?? "")} className="h-9" />
          <Textarea name={`text${i}`} aria-label={`Template ${i + 1} message`} rows={2} maxLength={1000} placeholder="Message" defaultValue={fieldDefault(state, `text${i}`, templates[i]?.text ?? "")} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {rows < 10 ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setRows(rows + 1)}>
            <Plus /> Another template
          </Button>
        ) : null}
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save templates
        </SubmitButton>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
