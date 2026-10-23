"use client";

import { useActionState, useState } from "react";
import { Tag } from "lucide-react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Tags } from "@/components/lead-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { taskTagsAction } from "../list-actions";

/** A task's tags; people who can change the task edit them in one comma-separated box. */
export function TaskTags({ taskId, tags, known, canEdit }: { taskId: string; tags: string[]; known: string[]; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: Parameters<typeof taskTagsAction>[0], f: FormData) => {
    const r = await taskTagsAction(prev, f);
    if (r.status === "ok") setEditing(false);
    return r;
  }, idle);
  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Tags tags={tags} />
        {canEdit ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Tag /> {tags.length ? "Edit tags" : "Add tags"}
          </Button>
        ) : null}
      </div>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <Input name="tags" list="task-known-tags" aria-label="Tags, comma between" autoFocus placeholder="Shoot, Urgent client" defaultValue={fieldDefault(state, "tags", tags.join(", "))} className="h-8 w-72 max-w-full" />
      <datalist id="task-known-tags">
        {known.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <SubmitButton size="sm" pendingLabel="Saving…">
        Save
      </SubmitButton>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </form>
  );
}
