"use client";

// Idea Boards (Stage 13.1): starting a board, and the star on a board card.
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { BOARD_TEMPLATE_HINTS, BOARD_TEMPLATE_LABELS, BOARD_TEMPLATES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createBoardAction, favouriteAction } from "./actions";


export function NewBoardForm({ places, clientId, projectId, sections, presets = [] }: { places: Array<{ id: string; name: string; isSpace: boolean }>; clientId?: string; projectId?: string; sections: string[]; presets?: Array<{ id: string; kind: string; name: string }> }) {
  const [state, action] = useActionState(createBoardAction, idle);
  const v = (name: string, initial = "") => fieldDefault(state, name, initial);
  return (
    <form action={action} className="space-y-3" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "new"}>
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name" name="title" state={state}>
          <Input id="title" name="title" required maxLength={120} defaultValue={v("title")} placeholder="NEET 2027 campaign ideas" {...invalidProps(state, "title")} />
        </Field>
        <Field label="Client or space" name="clientId" state={state}>
          <Select id="clientId" name="clientId" required defaultValue={v("clientId", clientId ?? "")} {...invalidProps(state, "clientId")}>
            <option value="" disabled>
              Pick one
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.isSpace ? `Space: ${p.name}` : p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section (optional)" name="section" state={state} hint="A folder, like “Campaigns” or “Retros”.">
          <Input id="section" name="section" maxLength={60} list="board-sections" defaultValue={v("section")} />
        </Field>
        <datalist id="board-sections">
          {sections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <Field label="Tags (optional)" name="tags" state={state} hint="Comma between.">
          <Input id="tags" name="tags" maxLength={200} defaultValue={v("tags")} placeholder="neet, q1" />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Start from{" "}
          <Link href="/templates?kind=board" className="text-xs font-normal text-primary hover:underline">
            or pick from the template gallery
          </Link>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {BOARD_TEMPLATES.map((t) => (
            <label key={t} className="flex cursor-pointer items-start gap-2 rounded-md border bg-card p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
              <input type="radio" name="template" value={t} defaultChecked={v("template", "blank") === t} className="mt-1 accent-[var(--primary)]" />
              <span>
                <span className="block font-medium">{BOARD_TEMPLATE_LABELS[t]}</span>
                <span className="block text-xs text-muted-foreground">{BOARD_TEMPLATE_HINTS[t]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">Style (optional)</legend>
        <Select name="palette" aria-label="Colours" defaultValue={v("palette")}>
          <option value="">Template colours</option>
          <option value="brand">Client brand colours</option>
          {presets.filter((p) => p.kind === "palette").map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="sticky" aria-label="Sticky style" defaultValue={v("sticky")}>
          <option value="">Template stickies</option>
          {presets.filter((p) => p.kind === "sticky").map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="layout" aria-label="Layout" defaultValue={v("layout")}>
          <option value="">Template layout</option>
          {presets.filter((p) => p.kind === "layout").map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </fieldset>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <SubmitButton pendingLabel="Making the board…">Make the board</SubmitButton>
    </form>
  );
}

export function FavouriteButton({ boardId, initial }: { boardId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from favourites" : "Add to favourites"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          if (!(await favouriteAction(boardId, !on)).ok) setOn(on);
        })
      }
      className="rounded-md p-1 text-muted-foreground hover:bg-hover hover:text-foreground"
    >
      <Star className={cn("size-4", on && "fill-current text-warning")} />
    </button>
  );
}
