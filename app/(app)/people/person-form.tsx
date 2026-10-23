"use client";

import { Checkbox } from "@/components/ui/choice";
import { useActionState } from "react";
import Link from "next/link";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, ROLES, ROLE_LABELS, WORK_LOCATIONS, type Role } from "@/lib/types";
import { createPersonAction, updatePersonAction } from "./actions";
import { UnsavedGuard } from "@/components/unsaved-guard";

export type PersonFormValues = {
  personId?: string;
  fullName: string;
  workEmail: string;
  workPhone: string;
  jobTitle: string;
  employmentType: string;
  workLocation: string;
  departmentId: string;
  reportsToId: string;
  capacityHoursPerWeek: string;
  joinDate: string;
  roles: Role[];
  personalEmail: string;
  personalPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
};

const LOCATION_LABELS = { office: "Office", home: "Home", hybrid: "Hybrid" } as const;

export function PersonForm({
  initial,
  departments,
  people,
  canGrantOwnerRoles,
  editingSelf,
}: {
  initial: PersonFormValues;
  departments: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
  canGrantOwnerRoles: boolean;
  editingSelf: boolean;
}) {
  const [state, action] = useActionState(initial.personId ? updatePersonAction : createPersonAction, idle);
  // After an error, fields show what was submitted (React resets forms after an action).
  const d = (name: Exclude<keyof PersonFormValues, "roles" | "personId">) => fieldDefault(state, name, initial[name]);
  const roles = state.status === "error" && Array.isArray(state.values?.roles) ? (state.values.roles as Role[]) : initial.roles;
  const f = (name: Exclude<keyof PersonFormValues, "roles" | "personId">) => ({ id: name, name, defaultValue: d(name), ...invalidProps(state, name) });

  return (
    // `key` remounts the fields after an error so they pick up the submitted values as defaults.
    <form action={action} className="max-w-3xl space-y-6" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <UnsavedGuard />
      {initial.personId ? <input type="hidden" name="personId" value={initial.personId} /> : null}
      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <h2 className="text-sm font-semibold">Work</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" name="fullName" state={state}>
            <Input {...f("fullName")} required />
          </Field>
          <Field label="Job title" name="jobTitle" state={state}>
            <Input {...f("jobTitle")} required placeholder="e.g. Video Editor" />
          </Field>
          <Field label="Google sign-in email" name="workEmail" state={state} hint="They sign in to Oppllo One with this Google account.">
            <Input {...f("workEmail")} type="email" required />
          </Field>
          <Field label="Work phone" name="workPhone" state={state}>
            <Input {...f("workPhone")} type="tel" placeholder="+91 94470 11223" />
          </Field>
          <Field label="Team" name="departmentId" state={state}>
            <Select {...f("departmentId")}>
              <option value="">No team</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reports to" name="reportsToId" state={state} hint="Their leave requests go to this person.">
            <Select {...f("reportsToId")}>
              <option value="">Nobody (the owner approves)</option>
              {people.filter((p) => p.id !== initial.personId).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employment" name="employmentType" state={state}>
            <Select {...f("employmentType")}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usually works from" name="workLocation" state={state}>
            <Select {...f("workLocation")}>
              {WORK_LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {LOCATION_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Joined on" name="joinDate" state={state}>
            <Input {...f("joinDate")} type="date" required />
          </Field>
          <Field label="Hours for project work per week" name="capacityHoursPerWeek" state={state} hint="Feeds the Week planning view. Interns are often 15.">
            <Input {...f("capacityHoursPerWeek")} type="number" min="0" max="80" step="0.5" required className="tabular" />
          </Field>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <div>
          <h2 className="text-sm font-semibold">Roles</h2>
          <p className="text-xs text-muted-foreground">
            Roles decide what they can see.
            {editingSelf ? " You can't change your own roles." : canGrantOwnerRoles ? "" : " Only the owner can give the Owner or HR role."}
          </p>
        </div>
        <fieldset className="grid gap-2 sm:grid-cols-3" disabled={editingSelf}>
          <legend className="sr-only">Roles</legend>
          {ROLES.map((r) => {
            const locked = !canGrantOwnerRoles && (r === "owner" || r === "hr");
            return (
              <label key={r} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-accent has-disabled:opacity-60">
                <Checkbox name="roles" value={r} defaultChecked={roles.includes(r)} disabled={locked} className="accent-primary" />
                {ROLE_LABELS[r]}
              </label>
            );
          })}
        </fieldset>
        {/* Disabled checkboxes don't submit: carry the roles the editor may not change. */}
        {editingSelf
          ? initial.roles.map((r) => <input key={r} type="hidden" name="roles" value={r} />)
          : !canGrantOwnerRoles
            ? initial.roles.filter((r) => r === "owner" || r === "hr").map((r) => <input key={r} type="hidden" name="roles" value={r} />)
            : null}
        {state.status === "error" && state.fieldErrors?.roles ? <p className="text-xs text-danger">{state.fieldErrors.roles[0]}</p> : null}
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 shadow-card md:p-5">
        <div>
          <h2 className="text-sm font-semibold">Personal (private)</h2>
          <p className="text-xs text-muted-foreground">Only they, HR and the owner see these. No Aadhaar or bank numbers here — payroll keeps those.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Personal phone" name="personalPhone" state={state}>
            <Input {...f("personalPhone")} type="tel" />
          </Field>
          <Field label="Personal email" name="personalEmail" state={state}>
            <Input {...f("personalEmail")} type="email" />
          </Field>
          <Field label="Emergency contact" name="emergencyContactName" state={state}>
            <Input {...f("emergencyContactName")} />
          </Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Their phone" name="emergencyContactPhone" state={state}>
              <Input {...f("emergencyContactPhone")} type="tel" />
            </Field>
            <Field label="Relation" name="emergencyContactRelation" state={state}>
              <Input {...f("emergencyContactRelation")} placeholder="Parent" />
            </Field>
          </div>
        </div>
      </section>

      <FormStatus state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{initial.personId ? "Save changes" : "Add person"}</SubmitButton>
        <Button asChild variant="ghost">
          <Link href={initial.personId ? `/people/${initial.personId}` : "/people"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
