"use client";

// Planning one post or ad (Stage 7.3, D81). One form for adding and editing; the calendar keeps it open beside the
// month on desktop and above the list on phones.
import { useActionState } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { APPROVAL_STATE_LABELS, CONTENT_CHANNEL_LABELS, CONTENT_CHANNELS, CONTENT_STATUS_LABELS, CONTENT_STATUSES, type ApprovalState } from "@/lib/types";
import type { ContentItemRecord } from "@/repositories";
import { removeContentAction, saveContentAction } from "./actions";

type Options = { assets: Array<{ id: string; title: string; approvalState: ApprovalState }>; people: Array<{ id: string; name: string }> };

export function ContentEditor({ clientId, item, day, options, onClose }: { clientId: string; item: ContentItemRecord | null; day: string; options: Options; onClose: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof saveContentAction>[0], form: FormData) => {
    const r = await saveContentAction(prev, form);
    if (r.status === "ok") onClose();
    return r;
  }, idle);
  const f = (name: string, initial: string) => ({ id: `content-${name}`, name, defaultValue: fieldDefault(state, name, initial), ...invalidProps(state, name, `content-${name}`) });
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card" aria-label={item ? "Edit item" : "New item"}>
      <h2 className="text-sm font-semibold">{item ? "Edit" : "Plan a post or ad"}</h2>
      <form action={action} key={state.status === "error" ? JSON.stringify(state.values ?? {}) : (item?.id ?? day)} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="clientId" value={clientId} />
        {item ? <input type="hidden" name="itemId" value={item.id} /> : null}
        <Field label="What" name="title" htmlFor="content-title" state={state} className="sm:col-span-2">
          <Input {...f("title", item?.title ?? "")} required maxLength={160} placeholder="e.g. Diwali fee offer" className="h-8" />
        </Field>
        <Field label="Where" name="channel" htmlFor="content-channel" state={state}>
          <Select {...f("channel", item?.channel ?? "instagram_post")} className="h-8">
            {CONTENT_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CONTENT_CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" name="status" htmlFor="content-status" state={state}>
          <Select {...f("status", item?.status ?? "idea")} className="h-8">
            {CONTENT_STATUSES.map((st) => (
              <option key={st} value={st}>
                {CONTENT_STATUS_LABELS[st]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Day" name="publishOn" htmlFor="content-publishOn" state={state}>
          <Input {...f("publishOn", item?.publishOn ?? day)} type="date" required className="h-8" />
        </Field>
        <Field label="Time (optional)" name="publishTime" htmlFor="content-publishTime" state={state}>
          <Input {...f("publishTime", item?.publishTime ?? "")} type="time" className="h-8" />
        </Field>
        <Field label="Creative" name="assetId" htmlFor="content-assetId" state={state} hint="Scheduled and published need it approved.">
          <Select {...f("assetId", item?.assetId ?? "")} className="h-8">
            <option value="">None yet</option>
            {options.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {APPROVAL_STATE_LABELS[a.approvalState]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Who posts it" name="ownerId" htmlFor="content-ownerId" state={state}>
          <Select {...f("ownerId", item?.ownerId ?? "")} className="h-8">
            <option value="">Nobody yet</option>
            {options.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Caption (optional)" name="caption" htmlFor="content-caption" state={state} className="sm:col-span-2">
          <Textarea {...f("caption", item?.caption ?? "")} rows={3} maxLength={2200} />
        </Field>
        <Field label="Live link, once published" name="publishedUrl" htmlFor="content-publishedUrl" state={state} className="sm:col-span-2">
          <Input {...f("publishedUrl", item?.publishedUrl ?? "")} type="url" placeholder="https://www.instagram.com/p/…" className="h-8" />
        </Field>
        {state.status === "error" ? <FormStatus state={state} className="sm:col-span-2" /> : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <SubmitButton size="sm" pendingLabel="Saving…">
            {item ? "Save" : "Add to calendar"}
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </form>
      {item ? <ConfirmForm action={removeContentAction} fields={{ itemId: item.id }} label="Take off the calendar" variant="ghost" confirm={`Take “${item.title}” off the calendar?`} showSuccess={false} /> : null}
    </section>
  );
}
