"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarCheck2, Users } from "lucide-react";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { idle } from "@/lib/action-state";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Preview } from "@/services/leave";
import { daysLabel } from "@/services/rules/leave";
import { applyLeaveAction, previewLeaveAction } from "../actions";

type TypeOption = { id: string; name: string; allowHalfDay: boolean; usesBalance: boolean };
type PersonOption = { id: string; name: string };

export function ApplyForm({ types, today, people, me }: { types: TypeOption[]; today: string; people: PersonOption[] | null; me: string }) {
  const [state, formAction] = useActionState(applyLeaveAction, idle);
  const [values, setValues] = useState({ leaveTypeId: types[0]?.id ?? "", startDate: today, endDate: today, halfDay: "", forPersonId: me });
  // Controlled, so React's form reset after a failed submit can't wipe what was typed.
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();

  const type = types.find((t) => t.id === values.leaveTypeId);
  const singleDay = values.startDate === values.endDate;
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => {
      const next = { ...v, [key]: e.target.value };
      // Keep the range sensible as dates change.
      if (key === "startDate" && next.endDate < next.startDate) next.endDate = next.startDate;
      if (next.startDate !== next.endDate) next.halfDay = "";
      return next;
    });

  // Ask the server what this request would do, a moment after the person stops changing it.
  useEffect(() => {
    const timer = setTimeout(() => {
      startChecking(async () => {
        const r = await previewLeaveAction({ ...values, halfDay: values.halfDay || null, forPersonId: values.forPersonId === me ? null : values.forPersonId });
        setPreview(r.preview);
        setPreviewError(r.error);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [values, me]);

  const blocked = Boolean(preview?.problem || previewError);

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        {people ? (
          <Field label="Who is this for?" name="forPersonId" state={state} hint="HR and the owner can record leave for anyone; it's approved straight away.">
            <Select id="forPersonId" name="forPersonId" value={values.forPersonId} onChange={set("forPersonId")}>
              <option value={me}>Me</option>
              {people.filter((p) => p.id !== me).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Type of leave" name="leaveTypeId" state={state}>
          <Select id="leaveTypeId" name="leaveTypeId" value={values.leaveTypeId} onChange={set("leaveTypeId")} {...invalidProps(state, "leaveTypeId")}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First day" name="startDate" state={state}>
            <Input id="startDate" name="startDate" type="date" value={values.startDate} onChange={set("startDate")} required {...invalidProps(state, "startDate")} />
          </Field>
          <Field label="Last day" name="endDate" state={state}>
            <Input id="endDate" name="endDate" type="date" value={values.endDate} min={values.startDate} onChange={set("endDate")} required {...invalidProps(state, "endDate")} />
          </Field>
        </div>
        {singleDay && type?.allowHalfDay ? (
          <Field label="Full or half day" name="halfDay" state={state}>
            <Select id="halfDay" name="halfDay" value={values.halfDay} onChange={set("halfDay")}>
              <option value="">Full day</option>
              <option value="first_half">Morning only</option>
              <option value="second_half">Afternoon only</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Reason (optional)" name="reason" state={state} hint="Your approver and HR see this. Colleagues only see that you're away.">
          <Textarea id="reason" name="reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cousin's wedding in Thrissur" />
        </Field>
        <FormStatus state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton pendingLabel="Sending…" disabled={blocked}>
            {values.forPersonId !== me ? "Record leave" : "Send request"}
          </SubmitButton>
          <Button asChild variant="ghost">
            <Link href="/leave">Back</Link>
          </Button>
        </div>
      </div>

      <aside aria-live="polite" className={cn("h-fit space-y-3 rounded-lg border bg-subtle p-4 transition-opacity", checking && "opacity-60")}>
        <h2 className="text-sm font-semibold">Before you send</h2>
        {previewError ? (
          <p className="flex gap-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {previewError}
          </p>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">{checking ? "Counting the days…" : !values.leaveTypeId ? "Pick the type of leave to see how many days this is." : "Pick dates to see how many days this is."}</p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm">
              <CalendarCheck2 className="size-4 text-primary" />
              <span>
                <span className="tabular font-semibold">{daysLabel(preview.halfDays)}</span> of leave
                <span className="text-muted-foreground"> (weekends and holidays don&apos;t count)</span>
              </span>
            </p>
            {type?.usesBalance
              ? preview.byYear.map((y) => (
                  <p key={y.year} className="text-sm text-muted-foreground">
                    {preview.byYear.length > 1 ? `${y.year}: ` : ""}
                    {y.availableBefore !== null ? (
                      <>
                        <span className="tabular text-foreground">{daysLabel(Math.max(0, y.availableBefore))}</span> left now →{" "}
                        {/* Over the balance: say by how much, not "0 days after" (QA S9-23). */}
                        {(y.availableAfter ?? 0) < 0 ? (
                          <span className="tabular font-medium text-danger">{daysLabel(-(y.availableAfter ?? 0))} over your balance</span>
                        ) : (
                          <>
                            <span className="tabular font-medium text-foreground">{daysLabel(y.availableAfter ?? 0)}</span> after
                          </>
                        )}
                      </>
                    ) : null}
                  </p>
                ))
              : <p className="text-sm text-muted-foreground">Unpaid leave has no balance; it needs approval.</p>}
            {preview.problem ? (
              <p className="flex gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {preview.problem}
              </p>
            ) : null}
            {preview.clashes.length ? (
              <div className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
                <p className="flex items-center gap-2 font-medium">
                  <Users className="size-4" /> Also away from your team
                </p>
                <ul className="mt-1 space-y-0.5">
                  {preview.clashes.map((c, i) => (
                    <li key={i}>
                      {c.personName}: {formatShortDate(c.startDate)}
                      {c.endDate !== c.startDate ? ` – ${formatShortDate(c.endDate)}` : ""}
                      {c.status === "pending" ? " (asked)" : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">You can still send it; your approver will see this too.</p>
              </div>
            ) : null}
          </>
        )}
      </aside>
    </form>
  );
}
