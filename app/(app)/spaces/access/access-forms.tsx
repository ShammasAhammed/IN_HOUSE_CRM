"use client";

import { useActionState, useState } from "react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Input, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { ACCESS_LEVEL_LABELS, ACCESS_LEVELS, type AccessLevel } from "@/lib/types";
import { accessPreview } from "@/services/rules/access";
import { askAccessAction, decideAccessAction, markReviewedAction } from "./actions";

type SpaceOption = { id: string; name: string; isPrivate: boolean; sensitive: boolean };

/** Ask for someone's access, with the plain-words preview of what they will and won't be able to do. */
export function AskAccessForm({ spaces, people, spaceId }: { spaces: SpaceOption[]; people: Array<{ id: string; name: string }>; spaceId: string }) {
  const [state, action] = useActionState(askAccessAction, idle);
  const [space, setSpace] = useState(fieldDefault(state, "spaceId", spaceId));
  const [person, setPerson] = useState(fieldDefault(state, "personId", ""));
  const [level, setLevel] = useState<AccessLevel>((fieldDefault(state, "level", "view") as AccessLevel) || "view");
  const [until, setUntil] = useState(fieldDefault(state, "expiresOn", ""));
  const s = spaces.find((x) => x.id === space);
  const p = people.find((x) => x.id === person);
  return (
    <form action={action} className="space-y-4" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Space" name="spaceId" htmlFor="a-space" state={state}>
          <Select id="a-space" name="spaceId" value={space} onChange={(e) => setSpace(e.target.value)} {...invalidProps(state, "spaceId", "a-space")}>
            <option value="" disabled>
              Choose…
            </option>
            {spaces.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.sensitive ? " (sensitive)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Person" name="personId" htmlFor="a-person" state={state}>
          <Select id="a-person" name="personId" value={person} onChange={(e) => setPerson(e.target.value)} {...invalidProps(state, "personId", "a-person")}>
            <option value="" disabled>
              Choose…
            </option>
            {people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Level" name="level" htmlFor="a-level" state={state}>
          <Select id="a-level" name="level" value={level} onChange={(e) => setLevel(e.target.value as AccessLevel)}>
            {ACCESS_LEVELS.map((l) => (
              <option key={l} value={l}>
                {ACCESS_LEVEL_LABELS[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Until (optional)" name="expiresOn" htmlFor="a-until" state={state} hint="Their last day. Empty means until removed.">
          <Input id="a-until" name="expiresOn" type="date" value={until} onChange={(e) => setUntil(e.target.value)} {...invalidProps(state, "expiresOn", "a-until")} />
        </Field>
      </div>
      <Field label="Why" name="reason" htmlFor="a-reason" state={state}>
        <Textarea id="a-reason" name="reason" rows={2} maxLength={300} placeholder="Handles GST filings from November" defaultValue={fieldDefault(state, "reason", "")} {...invalidProps(state, "reason", "a-reason")} />
      </Field>
      <Field label="Does their Google account have 2-step sign-in?" name="twoStep" htmlFor="a-2step" state={state} hint={s?.sensitive ? "Needed for sensitive spaces. Oppllo One can't check this itself: ask them or look in Google Workspace." : "Oppllo One can't check this itself."}>
        <Select id="a-2step" name="twoStep" defaultValue={fieldDefault(state, "twoStep", "")} {...invalidProps(state, "twoStep", "a-2step")}>
          <option value="">{s?.sensitive ? "Choose…" : "Not asked"}</option>
          <option value="yes">Yes</option>
          <option value="not_sure">Not sure</option>
        </Select>
      </Field>
      {s && p ? (
        <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info" aria-live="polite">
          {accessPreview({ personName: p.name, spaceName: s.name, level, expiresOn: until || null, isPrivate: s.isPrivate })}
        </p>
      ) : null}
      <FormStatus state={state} />
      <SubmitButton size="sm" pendingLabel="Sending…">
        Send for approval
      </SubmitButton>
    </form>
  );
}

export function DecideForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(decideAccessAction, idle);
  const id = `d-${requestId}`;
  return (
    <form action={action} className="space-y-2" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "form"}>
      <input type="hidden" name="requestId" value={requestId} />
      <Field label="Note (needed to refuse)" name="note" htmlFor={id} state={state}>
        <Input id={id} name="note" maxLength={300} defaultValue={fieldDefault(state, "note", "")} {...invalidProps(state, "note", id)} />
      </Field>
      <FormStatus state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" name="decision" value="approve" pendingLabel="Saving…">
          Approve
        </SubmitButton>
        <SubmitButton size="sm" variant="outline" name="decision" value="refuse" pendingLabel="Saving…">
          Refuse
        </SubmitButton>
      </div>
    </form>
  );
}

export function MarkReviewed({ spaceId, name }: { spaceId: string; name: string }) {
  return <ConfirmForm action={markReviewedAction} fields={{ spaceId }} label="Reviewed: keep the rest" pendingLabel="Saving…" ariaLabel={`Mark ${name} reviewed`} />;
}
