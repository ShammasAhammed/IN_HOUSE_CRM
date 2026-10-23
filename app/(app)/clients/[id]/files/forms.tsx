"use client";

// Adding and setting up a client's files (Stage 13.0).
import { useActionState, useState } from "react";
import { FormStatus, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { CLIENT_LINK_KIND_LABELS, CLIENT_LINK_KINDS } from "@/lib/types";
import type { LinkView } from "@/services/client-links";
import { addLinkAction, linkSettingsAction, refreshLinkAction, removeLinkAction, uploadArtifactAction } from "./actions";

export function AddLink({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(addLinkAction, idle);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <Input name="url" required placeholder="Paste a Google Sheets, Docs, Slides, Drive or any link" aria-label="Link" className="h-9" />
      <div className="flex flex-wrap gap-2">
        <Select name="kind" defaultValue="" aria-label="Type" className="h-9 w-44">
          <option value="">Type: guess from the link</option>
          {CLIENT_LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {CLIENT_LINK_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Input name="title" placeholder="Title (Google's own if empty)" aria-label="Title" className="h-9 min-w-0 flex-1" />
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </div>
      <FormStatus state={state} />
    </form>
  );
}

export function UploadArtifact({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(uploadArtifactAction, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <Input type="file" name="file" accept=".html,.htm,.md,.markdown" required aria-label="Artifact page" className="h-9 min-w-0 flex-1 text-sm" />
      <SubmitButton size="sm" variant="outline" pendingLabel="Uploading…">
        Upload page
      </SubmitButton>
      <FormStatus state={state} className="basis-full" />
    </form>
  );
}

/** A file's switches and set-up, one change at a time. */
export function LinkSettings({ link, canSetUp }: { link: LinkView; canSetUp: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tabs, setTabs] = useState(link.tabs.join(", "));
  const [summary, setSummary] = useState(link.summary.map((s) => `${s.label} = ${s.range}`).join("\n"));
  const save = async (input: Parameters<typeof linkSettingsAction>[0]) => setMessage((await linkSettingsAction(input)).message);
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => save({ linkId: link.id, aiReadable: !link.aiReadable })}>
          {link.aiReadable ? "AI may read: on (turn off)" : "AI may read: off (turn on)"}
        </Button>
        {link.googleId ? (
          <Button size="sm" variant="ghost" onClick={async () => setMessage((await refreshLinkAction(link.id)).message)}>
            Check with Google
          </Button>
        ) : null}
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            Remove it?
            <Button size="sm" variant="ghost" className="text-danger" onClick={async () => setMessage((await removeLinkAction(link.id)).message)}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )}
      </div>
      {link.googleType === "sheet" ? (
        <>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Tabs that may be read (comma between; empty = every tab)</span>
            <span className="flex gap-2">
              <Input value={tabs} onChange={(e) => setTabs(e.target.value)} className="h-8" aria-label="Tabs that may be read" />
              <Button size="sm" variant="outline" onClick={() => save({ linkId: link.id, tabs: tabs.split(",").map((t) => t.trim()).filter(Boolean) })}>
                Save
              </Button>
            </span>
          </label>
          {canSetUp ? (
            <>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Summary: one per line, &quot;Label = NamedRange&quot; (e.g. Planned budget = PlannedBudget)</span>
                <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full rounded-md border bg-card px-2 py-1 text-sm" aria-label="Summary named ranges" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    save({
                      linkId: link.id,
                      summary: summary
                        .split("\n")
                        .map((l) => l.split("="))
                        .filter((p) => p.length === 2 && p[0]!.trim() && p[1]!.trim())
                        .map(([label, range]) => ({ label: label!.trim(), range: range!.trim() })),
                    })
                  }
                >
                  Save summary
                </Button>
              </label>
              <Button size="sm" variant="ghost" onClick={() => save({ linkId: link.id, writeBack: !link.writeBack })}>
                {link.writeBack ? "Write-back to the “Oppllo data” tab: on (turn off)" : "Write-back to an “Oppllo data” tab: off (turn on)"}
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
