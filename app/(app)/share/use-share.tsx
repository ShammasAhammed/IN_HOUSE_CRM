"use client";

// Filing what a phone shared: which client or space, which board (optional), a note and tags.
import { useActionState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Input, Select } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { useShareAction } from "../swipe/actions";

export function UseShare({ share, places, boards }: { share: { id: string; url: string | null; title: string | null; text: string | null; fileName: string | null }; places: Array<{ id: string; name: string; isSpace: boolean }>; boards: Array<{ id: string; title: string; clientName: string }> }) {
  const [state, action] = useActionState(useShareAction, idle);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="shareId" value={share.id} />
      <div className="rounded-md bg-subtle px-3 py-2 text-sm">
        <p className="font-medium break-words">{share.title || share.fileName || "Shared item"}</p>
        {share.url ? <p className="truncate text-xs text-muted-foreground">{share.url}</p> : null}
        {share.fileName ? <p className="text-xs text-muted-foreground">Picture: {share.fileName}</p> : null}
      </div>
      <Select name="clientId" required defaultValue="" aria-label="Client or space" className="h-10">
        <option value="" disabled>
          Which client or space?
        </option>
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.isSpace ? `Space: ${p.name}` : p.name}
          </option>
        ))}
      </Select>
      <Select name="boardId" defaultValue="" aria-label="Also put it on a board" className="h-10">
        <option value="">Swipe file only</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title} ({b.clientName})
          </option>
        ))}
      </Select>
      <Input name="notes" defaultValue={share.text && share.text !== share.url ? share.text.slice(0, 500) : ""} placeholder="Why it's good" aria-label="Note" className="h-10" />
      <Input name="tags" placeholder="Tags: good hook, nursing, trend" aria-label="Tags" className="h-10" />
      <FormStatus state={state} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
