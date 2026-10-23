"use client";

// Template gallery (Stage 13.6): using a template, approving and removing it, presets, and "Save as template".
import { useActionState, useState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { GALLERY_TAGS } from "@/lib/types";
import { MIND_LAYOUT_LABELS, MIND_LAYOUTS } from "@/services/rules/mind-map";
import { approveTemplateAction, checkTemplateAction, removePresetAction, removeTemplateAction, saveBoardTemplateAction, savePageTemplateAction, savePresetAction, useTemplateAction } from "./actions";

type Option = { id: string; name: string };
type Preset = { id: string; kind: "palette" | "sticky" | "layout"; name: string };

export function UseTemplateForm({ templateKey, kind, places, projects, presets, defaultTitle }: { templateKey: string; kind: "board" | "page"; places: Array<Option & { isSpace: boolean }>; projects: Array<Option & { clientId: string }>; presets: Preset[]; defaultTitle: string }) {
  const [state, action] = useActionState(useTemplateAction, idle);
  const [clientId, setClientId] = useState(fieldDefault(state, "clientId", ""));
  const pick = (k: Preset["kind"]) => presets.filter((p) => p.kind === k);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="key" value={templateKey} />
      <Input name="title" aria-label="Name" required maxLength={120} defaultValue={fieldDefault(state, "title", defaultTitle)} />
      <Select name="clientId" aria-label="Where" value={clientId} onChange={(e) => setClientId(e.target.value)} required={kind === "board"}>
        <option value="">{kind === "board" ? "Pick a client or space" : "Team page: everyone sees it"}</option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.isSpace ? `Space: ${p.name}` : p.name}
          </option>
        ))}
      </Select>
      {kind === "board" ? (
        <>
          <Select name="projectId" aria-label="Project" defaultValue="">
            <option value="">No project</option>
            {projects
              .filter((p) => p.clientId === clientId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select name="palette" aria-label="Colours" defaultValue="">
              <option value="">Template colours</option>
              <option value="brand">Client brand colours</option>
              {pick("palette").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select name="sticky" aria-label="Sticky style" defaultValue="">
              <option value="">Template stickies</option>
              {pick("sticky").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select name="layout" aria-label="Layout" defaultValue="">
              <option value="">Template layout</option>
              {pick("layout").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">&quot;{"{client}"}&quot; becomes the client&apos;s name; fill in &quot;[date]&quot; and the placeholders yourself.</p>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Making it…">Use template</SubmitButton>
    </form>
  );
}

export function ApproveTemplate({ id, approved }: { id: string; approved: boolean }) {
  const [state, action] = useActionState(approveTemplateAction, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {approved ? null : <input type="hidden" name="on" value="on" />}
      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
        {approved ? "Take back approval" : "Approve for the team"}
      </SubmitButton>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function RemoveTemplate({ id }: { id: string }) {
  const [state, action] = useActionState(removeTemplateAction, idle);
  const [sure, setSure] = useState(false);
  if (!sure)
    return (
      <Button size="sm" variant="ghost" onClick={() => setSure(true)}>
        Remove template
      </Button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      Remove it from the gallery? Boards and pages made from it stay.
      <SubmitButton size="sm" variant="destructive" pendingLabel="Removing…">
        Remove
      </SubmitButton>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)}>
        Keep
      </Button>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}

export function PresetForm({ canShare }: { canShare: boolean }) {
  const [state, action] = useActionState(savePresetAction, idle);
  const [kind, setKind] = useState("palette");
  return (
    <form action={action} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select name="kind" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="palette">Colour palette</option>
          <option value="sticky">Sticky style</option>
          <option value="layout">Layout</option>
        </Select>
        <Input name="name" aria-label="Preset name" placeholder="Name, e.g. Navy and gold" required maxLength={80} />
      </div>
      <Input name="colours" aria-label="Colours" placeholder={kind === "sticky" ? "#ffdeeb" : kind === "palette" ? "#0b5394 #f1c232 #ffffff" : "Section colours (optional): #e7f5ff #ebfbee"} required={kind !== "layout"} />
      {kind === "sticky" ? (
        <Select name="font" aria-label="Font" defaultValue="hand">
          <option value="hand">Handwritten</option>
          <option value="clean">Clean</option>
        </Select>
      ) : null}
      {kind === "layout" ? (
        <Select name="mindLayout" aria-label="Mind-map layout" defaultValue="">
          <option value="">Mind maps as they are</option>
          {MIND_LAYOUTS.map((l) => (
            <option key={l} value={l}>
              Mind maps: {MIND_LAYOUT_LABELS[l]}
            </option>
          ))}
        </Select>
      ) : null}
      <Select name="scope" aria-label="Who sees it" defaultValue="mine">
        <option value="mine">Only me</option>
        {canShare ? <option value="company">The whole team</option> : null}
      </Select>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save preset
      </SubmitButton>
    </form>
  );
}

export function RemovePreset({ id }: { id: string }) {
  const [, action] = useActionState(removePresetAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="ghost" pendingLabel="…">
        Remove
      </SubmitButton>
    </form>
  );
}

/**
 * "Save as template" for a board or a page: first shows what will be taken out (client data), then saves.
 * `onSaved` gets the cleaned board elements (to draw the template's picture).
 */
export function SaveAsTemplate({ target, defaultName, onSaved }: { target: { boardId: string } | { docId: string }; defaultName: string; onSaved?: (id: string, elements: unknown[] | null) => Promise<void> | void }) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [scope, setScope] = useState("mine");
  const [keepRows, setKeepRows] = useState(false);
  const [removed, setRemoved] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isPage = "docId" in target;

  async function check() {
    setBusy(true);
    const r = await checkTemplateAction({ ...target, keepRows });
    setBusy(false);
    if (!r.ok) return setMessage({ ok: false, text: r.message });
    setRemoved(r.value.removed);
  }
  async function save() {
    setBusy(true);
    const common = { name, description, tags, scope };
    const r = "docId" in target ? await savePageTemplateAction({ ...common, docId: target.docId, keepRows }) : await saveBoardTemplateAction({ ...common, boardId: target.boardId });
    if (r.ok) await onSaved?.(r.value.id, "elements" in r.value ? (r.value.elements as unknown[]) : null);
    setBusy(false);
    setMessage(r.ok ? { ok: true, text: `Saved to the gallery${scope === "company" ? "; a strategist or the owner approves it for the team" : " (only you see it)"}.` } : { ok: false, text: r.message });
    if (r.ok) setRemoved(null);
  }

  return (
    <div className="space-y-2 text-sm">
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" maxLength={80} />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" placeholder="What it's for (optional)" maxLength={300} />
      <Input value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" placeholder="Tags, comma between" list="gallery-tags" maxLength={200} />
      <datalist id="gallery-tags">
        {GALLERY_TAGS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Who sees it">
        <option value="mine">Only me</option>
        <option value="company">The whole team (after approval)</option>
      </Select>
      {isPage ? (
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={keepRows} onChange={(e) => (setKeepRows(e.target.checked), setRemoved(null))} /> Keep the rows of tables (people are left out)
        </label>
      ) : null}
      {removed ? (
        <div className="space-y-2 rounded-md border bg-warning-soft p-2 text-xs text-warning" role="status">
          {removed.length ? (
            <>
              <p className="font-medium">So the template carries no client data, these are taken out of the copy (your {isPage ? "page" : "board"} stays as it is):</p>
              <ul className="list-disc pl-4">
                {removed.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p>Cards, pictures and links become empty boxes of the same size; the client&apos;s name becomes &quot;{"{client}"}&quot;.</p>
            </>
          ) : (
            <p>Nothing to take out. Comments, votes and reactions are never copied.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy || !name.trim()}>
              Save template
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRemoved(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => void check()} disabled={busy || !name.trim()}>
          Save as template…
        </Button>
      )}
      {message ? <p className={message.ok ? "text-xs text-success" : "text-xs text-danger"}>{message.text}</p> : null}
    </div>
  );
}
