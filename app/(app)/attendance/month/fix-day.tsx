"use client";

// HR or the owner records or corrects one day, always with a reason (kept on the record and in the history).
import { useActionState, useState } from "react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { ATTENDANCE_LOCATIONS, ATTENDANCE_LOCATION_LABELS } from "@/lib/types";
import { recordAttendanceAction, removeAttendanceAction } from "../actions";

type Current = { location: string; inTime: string; outTime: string; note: string } | null;

export function FixDay({ personId, workDate, dayLabel, current }: { personId: string; workDate: string; dayLabel: string; current: Current }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(recordAttendanceAction, idle);
  const [removeState, remove] = useActionState(removeAttendanceAction, idle);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`${current ? "Correct" : "Record"} ${dayLabel}`}>
        {current ? "Correct" : "Record"}
      </Button>
    );
  }
  const p = (n: string) => `${workDate}-${n}`;
  const d = (n: string, v: string) => fieldDefault(state, n, v);
  return (
    <div className="basis-full space-y-3 rounded-md bg-subtle p-3">
      <form action={action} className="grid gap-3 sm:grid-cols-4" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="workDate" value={workDate} />
        <Field label="Where" name="location" htmlFor={p("location")} state={state}>
          <Select id={p("location")} name="location" defaultValue={d("location", current?.location ?? "office")} className="h-8">
            {ATTENDANCE_LOCATIONS.map((l) => (
              <option key={l} value={l}>
                {ATTENDANCE_LOCATION_LABELS[l]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="In" name="inTime" htmlFor={p("in")} state={state}>
          <Input id={p("in")} name="inTime" type="time" required defaultValue={d("inTime", current?.inTime ?? "09:30")} className="h-8" {...invalidProps(state, "inTime", p("in"))} />
        </Field>
        <Field label="Out" name="outTime" htmlFor={p("out")} state={state}>
          <Input id={p("out")} name="outTime" type="time" defaultValue={d("outTime", current?.outTime ?? "")} className="h-8" {...invalidProps(state, "outTime", p("out"))} />
        </Field>
        <Field label="Note" name="note" htmlFor={p("note")} state={state}>
          <Input id={p("note")} name="note" maxLength={200} defaultValue={d("note", current?.note ?? "")} className="h-8" />
        </Field>
        <Field label="Why" name="reason" htmlFor={p("reason")} state={state} className="sm:col-span-3">
          <Input id={p("reason")} name="reason" required maxLength={300} placeholder="e.g. Forgot to check in; confirmed by Anjali" defaultValue={d("reason", "")} className="h-8" {...invalidProps(state, "reason", p("reason"))} />
        </Field>
        <div className="flex items-end gap-2">
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </form>
      <FormStatus state={state} />
      {/* After removing, the day has no record left, so the remove form goes: its message stays here. */}
      {removeState.status === "ok" ? <FormStatus state={removeState} /> : null}
      {current ? (
        <form action={remove} className="flex flex-wrap items-end gap-2 border-t pt-3">
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="workDate" value={workDate} />
          <Field label="Recorded by mistake? Why remove it" name="reason" htmlFor={p("remove-reason")} state={removeState} className="min-w-56 flex-1">
            <Input id={p("remove-reason")} name="reason" required maxLength={300} className="h-8" />
          </Field>
          <SubmitButton size="sm" variant="outline" pendingLabel="Removing…">
            Remove the day
          </SubmitButton>
          {removeState.status === "error" ? <FormStatus state={removeState} className="basis-full" /> : null}
        </form>
      ) : null}
    </div>
  );
}
