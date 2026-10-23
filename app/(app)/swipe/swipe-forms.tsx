"use client";

// The swipe file (Stage 13.2): add a link or a screenshot, and each item's notes, tags, "Add to board" and remove.
import { useActionState, useState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import type { SwipeView } from "@/services/swipe";
import { addToBoardAction, editSwipeAction, removeSwipeAction, saveFileAction, saveLinkAction } from "./actions";

type Place = { id: string; name: string; isSpace: boolean };
type BoardOption = { id: string; title: string; clientName: string };

function PlaceSelect({ places, value }: { places: Place[]; value: string }) {
  return (
    <Select name="clientId" required defaultValue={value} aria-label="Client or space" className="h-9">
      <option value="" disabled>
        Client or space
      </option>
      {places.map((p) => (
        <option key={p.id} value={p.id}>
          {p.isSpace ? `Space: ${p.name}` : p.name}
        </option>
      ))}
    </Select>
  );
}

export function AddLink({ places, clientId = "", url = "", boards = [], then }: { places: Place[]; clientId?: string; url?: string; boards?: BoardOption[]; then?: "board" }) {
  const [state, action] = useActionState(saveLinkAction, idle);
  return (
    <form action={action} className="space-y-2" key={state.status === "ok" ? state.message : "link"}>
      {then ? <input type="hidden" name="then" value={then} /> : null}
      <Input name="url" required defaultValue={fieldDefault(state, "url", url)} placeholder="Paste a link: a page, YouTube, Instagram, Facebook" aria-label="Link" className="h-9" />
      <div className="grid gap-2 sm:grid-cols-2">
        <PlaceSelect places={places} value={fieldDefault(state, "clientId", clientId)} />
        {boards.length ? (
          <Select name="boardId" defaultValue="" aria-label="Also put it on a board" className="h-9">
            <option value="">Not on a board</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.clientName})
              </option>
            ))}
          </Select>
        ) : null}
        <Input name="notes" defaultValue={fieldDefault(state, "notes", "")} placeholder="Why it's good" aria-label="Note" className="h-9" maxLength={2000} />
        <Input name="tags" defaultValue={fieldDefault(state, "tags", "")} placeholder="Tags: good hook, nursing, trend" aria-label="Tags" className="h-9" />
      </div>
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Reading the link…">
        Save the link
      </SubmitButton>
    </form>
  );
}

export function AddFile({ places, videoOk }: { places: Place[]; videoOk: boolean }) {
  const [state, action] = useActionState(saveFileAction, idle);
  return (
    <form action={action} className="space-y-2" key={state.status === "ok" ? state.message : "file"}>
      <Input type="file" name="file" required accept={videoOk ? "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp,image/gif"} aria-label="Screenshot" className="h-9 text-sm" />
      <div className="grid gap-2 sm:grid-cols-3">
        <PlaceSelect places={places} value={fieldDefault(state, "clientId", "")} />
        <Input name="notes" placeholder="Why it's good" aria-label="Note" className="h-9" />
        <Input name="tags" placeholder="Tags" aria-label="Tags" className="h-9" />
      </div>
      <FormStatus state={state} />
      <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
        Save the {videoOk ? "screenshot or video" : "screenshot"}
      </SubmitButton>
      {videoOk ? null : <p className="text-xs text-muted-foreground">Videos: save a link to them. Uploading the team&apos;s own videos needs files kept in Google Drive (the database holds files up to 3.5 MB).</p>}
    </form>
  );
}

export function SwipeItemTools({ item, boards }: { item: SwipeView; boards: BoardOption[] }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [board, setBoard] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const [tags, setTags] = useState(item.tags.join(", "));
  return (
    <div className="space-y-2 text-xs">
      {editing ? (
        <div className="space-y-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" className="h-8 text-xs" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} aria-label="Note" className="text-xs" />
          <Input value={tags} onChange={(e) => setTags(e.target.value)} aria-label="Tags" className="h-8 text-xs" placeholder="Tags, comma between" />
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={async () => {
                const r = await editSwipeAction({ id: item.id, title, notes, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
                setMessage(r.ok ? null : r.message);
                if (r.ok) setEditing(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Notes &amp; tags
          </Button>
          {boards.length ? (
            <span className="inline-flex items-center gap-1">
              <Select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Add to a board" className="h-8 max-w-44 text-xs">
                <option value="">Add to board…</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.clientName})
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="outline" disabled={!board} onClick={async () => setMessage((await addToBoardAction(item.id, board)).message ?? null)}>
                Add
              </Button>
            </span>
          ) : null}
          {item.canEdit ? (
            removing ? (
              <span className="inline-flex items-center gap-1">
                Remove it?
                <Button size="sm" variant="ghost" className="text-danger" onClick={async () => setMessage((await removeSwipeAction(item.id)).message ?? null)}>
                  Remove
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>
                Remove
              </Button>
            )
          ) : null}
        </div>
      )}
      {message ? (
        <p role="status" className="text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
