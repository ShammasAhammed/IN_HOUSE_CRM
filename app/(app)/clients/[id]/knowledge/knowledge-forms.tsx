"use client";

import { useActionState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { UnsavedGuard } from "@/components/unsaved-guard";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { KNOWLEDGE_FILE_KIND_LABELS, KNOWLEDGE_FILE_KINDS } from "@/lib/types";
import { ACCEPTED_TASK_FILE_EXTENSIONS } from "@/services/rules/task-files";
import { addCampaignAction, addClientFileAction, removeCampaignAction, removeClientFileAction, saveKnowledgeAction } from "./actions";

export function KnowledgeForm({ clientId, version, initial }: { clientId: string; version: number; initial: { tone: string; dos: string; donts: string; brandColours: string } }) {
  const [state, action] = useActionState(saveKnowledgeAction, idle);
  const f = (name: keyof typeof initial) => ({ id: name, name, defaultValue: fieldDefault(state, name, initial[name]), ...invalidProps(state, name) });
  return (
    <form action={action} className="space-y-4" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <UnsavedGuard />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="version" value={version} />
      <Field label="Tone of voice" name="tone" state={state} hint="How the client sounds: warm or formal, which language first, words they use.">
        <Textarea {...f("tone")} rows={3} maxLength={2000} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Do's" name="dos" state={state} hint="One per line.">
          <Textarea {...f("dos")} rows={6} maxLength={4000} />
        </Field>
        <Field label="Don'ts" name="donts" state={state} hint="One per line.">
          <Textarea {...f("donts")} rows={6} maxLength={4000} />
        </Field>
      </div>
      <Field label="Brand colours" name="brandColours" state={state} hint="Hex codes, comma between (#6D28D9, #F59F00). Offered as sticky colours on Idea Boards.">
        <Input {...f("brandColours")} maxLength={120} />
      </Field>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={`/clients/${clientId}` as Route}>Back to the client</Link>
        </Button>
      </div>
    </form>
  );
}

export function CampaignForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(addCampaignAction, idle);
  const f = (name: string) => ({ id: `c-${name}`, name, defaultValue: fieldDefault(state, name, ""), ...invalidProps(state, name, `c-${name}`) });
  return (
    <form action={action} className="space-y-3 rounded-md border p-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Campaign" name="name" htmlFor="c-name" state={state}>
          <Input {...f("name")} maxLength={120} placeholder="Prelims 2026 admissions" />
        </Field>
        <Field label="When (optional)" name="period" htmlFor="c-period" state={state}>
          <Input {...f("period")} maxLength={60} placeholder="Apr–Jun 2026" />
        </Field>
      </div>
      <Field label="What worked" name="whatWorked" htmlFor="c-whatWorked" state={state}>
        <Textarea {...f("whatWorked")} rows={3} maxLength={2000} />
      </Field>
      <Field label="What to avoid next time (optional)" name="whatToAvoid" htmlFor="c-whatToAvoid" state={state}>
        <Textarea {...f("whatToAvoid")} rows={2} maxLength={2000} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add campaign
      </SubmitButton>
    </form>
  );
}

export function FileForm({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(addClientFileAction, idle);
  return (
    <form action={action} className="space-y-3 rounded-md border p-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What it is" name="kind" htmlFor="f-kind" state={state}>
          <Select id="f-kind" name="kind" defaultValue={fieldDefault(state, "kind", "brand")}>
            {KNOWLEDGE_FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KNOWLEDGE_FILE_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name (optional)" name="title" htmlFor="f-title" state={state}>
          <Input id="f-title" name="title" maxLength={120} placeholder="Logo, colours, posting SOP…" defaultValue={fieldDefault(state, "title", "")} />
        </Field>
      </div>
      <Field label="File (up to 3.5 MB)" name="file" htmlFor="f-file" state={state} hint="PDF, photo, Word, Excel, PowerPoint, CSV or text. Fonts, SVG and big kits: paste a Drive link.">
        <Input id="f-file" name="file" type="file" accept={ACCEPTED_TASK_FILE_EXTENSIONS} className="h-9 text-sm" {...invalidProps(state, "file", "f-file")} />
      </Field>
      <Field label="Or a link (Drive, Canva, Figma, Google Docs)" name="link" htmlFor="f-link" state={state}>
        <Input id="f-link" name="link" type="url" inputMode="url" placeholder="https://" defaultValue={fieldDefault(state, "link", "")} {...invalidProps(state, "link", "f-link")} />
      </Field>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Adding…">
        Add
      </SubmitButton>
    </form>
  );
}

export function RemoveCampaign({ campaignId, name }: { campaignId: string; name: string }) {
  return <ConfirmForm action={removeCampaignAction} fields={{ campaignId }} label="Remove" pendingLabel="Removing…" variant="ghost" showSuccess={false} ariaLabel={`Remove ${name}`} />;
}

export function RemoveFile({ fileId, title }: { fileId: string; title: string }) {
  return <ConfirmForm action={removeClientFileAction} fields={{ fileId }} label="Remove" pendingLabel="Removing…" variant="ghost" showSuccess={false} ariaLabel={`Remove ${title}`} />;
}
