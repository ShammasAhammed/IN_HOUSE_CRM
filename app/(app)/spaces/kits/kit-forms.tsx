"use client";

// Space kits (Stage 14.4): preview, then apply, to an existing space or a new one; the owner's changes to a kit.
import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Input, Select } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { applyKitAction, kitOverridesAction, previewKitAction } from "../actions";

type Preview = { create: string[]; existing: string[]; privacy: string | null; notes: string[] };

export function ApplyKit({ kit, spaces, canAddSpace, defaultName }: { kit: string; spaces: Array<{ id: string; name: string }>; canAddSpace: boolean; defaultName: string }) {
  const [where, setWhere] = useState(canAddSpace ? "new" : (spaces[0]?.id ?? ""));
  const [name, setName] = useState(defaultName);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; spaceId?: string } | null>(null);
  const input = where === "new" ? { kit, newSpaceName: name } : { kit, spaceId: where };
  return (
    <div className="space-y-3 text-sm">
      <Select aria-label="Where" value={where} onChange={(e) => (setWhere(e.target.value), setPreview(null))}>
        {canAddSpace ? <option value="new">A new space</option> : null}
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {where === "new" ? <Input aria-label="New space name" value={name} onChange={(e) => (setName(e.target.value), setPreview(null))} maxLength={60} /> : null}
      {!preview ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !where}
          onClick={async () => {
            setBusy(true);
            const r = await previewKitAction(input);
            setBusy(false);
            if (!r.ok) return setMessage({ ok: false, text: r.message });
            setMessage(null);
            setPreview(r.value);
          }}
        >
          Preview what it makes
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border bg-subtle p-3" role="status">
          {preview.privacy ? <p className="font-medium text-warning">{preview.privacy}</p> : null}
          {preview.create.length ? (
            <>
              <p className="font-medium">It will make:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {preview.create.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Everything in this kit is already there. Nothing new to make.</p>
          )}
          {preview.existing.length ? <p className="text-xs text-muted-foreground">Already there, not made again: {preview.existing.length}.</p> : null}
          {preview.notes.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || (!preview.create.length && !preview.privacy)}
              onClick={async () => {
                setBusy(true);
                const r = await applyKitAction(input);
                setBusy(false);
                setPreview(null);
                setMessage(r.ok ? { ok: true, text: `Done: ${r.value.created.length} made.${r.value.privacy ? ` ${r.value.privacy}` : ""}`, spaceId: r.value.spaceId } : { ok: false, text: r.message });
              }}
            >
              Apply the kit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message ? (
        <p className={message.ok ? "text-success" : "text-danger"}>
          {message.text}{" "}
          {message.spaceId ? (
            <Link href={`/clients/${message.spaceId}` as Route} className="text-primary hover:underline">
              Open the space
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function EditKit({ kit, items }: { kit: string; items: Array<{ key: string; label: string; off: boolean; day?: { value: number; weekly: boolean }; target?: number }> }) {
  const [state, action] = useActionState(kitOverridesAction, idle);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="kit" value={kit} />
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center gap-2">
            {i.key === "project" ? <span className="w-5" /> : <Checkbox name="off" value={i.key} defaultChecked={i.off} aria-label={`Leave out: ${i.label}`} />}
            <span className="min-w-0 flex-1">{i.label}</span>
            {i.day ? <Input name={`day:${i.key}`} type="number" min={1} max={i.day.weekly ? 6 : 31} defaultValue={i.day.value} aria-label={i.day.weekly ? "Weekday, 1 = Monday" : "Day of the month"} className="h-8 w-20" /> : null}
            {i.target !== undefined ? <Input name={`target:${i.key}`} type="number" min={0} defaultValue={i.target} aria-label="Target" className="h-8 w-24" /> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Ticked = left out. Days: 1–28 or 31 for the last working day (weekly: 1 = Monday … 6 = Saturday). Spaces already set up keep what they have.</p>
      {state.status !== "idle" ? <FormStatus state={state} /> : null}
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save the kit
      </SubmitButton>
    </form>
  );
}
