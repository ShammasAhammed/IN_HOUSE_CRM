"use client";

import { Checkbox } from "@/components/ui/choice";
import { useActionState } from "react";
import Link from "next/link";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import { createProjectAction } from "../../../actions";

type Values = { clientId: string; engagementId: string; name: string; leadId: string; startDate: string; dueDate: string; description: string };

export function ProjectForm({
  initial,
  engagements,
  people,
}: {
  initial: Values;
  engagements: Array<{ id: string; name: string }>;
  people: Array<{ id: string; fullName: string }>;
}) {
  const [state, action] = useActionState(createProjectAction, idle);
  const f = (name: Exclude<keyof Values, "clientId">) => ({ id: name, name, defaultValue: fieldDefault(state, name, initial[name]), ...invalidProps(state, name) });
  const starter = state.status === "error" ? state.values?.starterTasks === "on" : true;

  return (
    <form action={action} className="max-w-2xl space-y-5 rounded-lg border bg-card p-4 shadow-card md:p-5" key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}>
      <input type="hidden" name="clientId" value={initial.clientId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" state={state} className="sm:col-span-2">
          <Input {...f("name")} required maxLength={120} placeholder="e.g. NEET 2027 admissions campaign" />
        </Field>
        <Field label="Engagement" name="engagementId" state={state} hint="Its service decides the stages and starter tasks.">
          <Select {...f("engagementId")}>
            <option value="">None (internal or unbilled work)</option>
            {engagements.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lead" name="leadId" state={state}>
          <Select {...f("leadId")}>
            <option value="">The client&apos;s lead strategist</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Starts" name="startDate" state={state}>
          <Input {...f("startDate")} type="date" required />
        </Field>
        <Field label="Due" name="dueDate" state={state}>
          <Input {...f("dueDate")} type="date" />
        </Field>
        <Field label="What it's for" name="description" state={state} className="sm:col-span-2">
          <Textarea {...f("description")} maxLength={2000} rows={3} />
        </Field>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="starterTasks" name="starterTasks" defaultChecked={starter} className="mt-0.5 size-4 accent-primary" />
        <Label htmlFor="starterTasks" className="font-normal">
          Add the service&apos;s starter tasks
          <span className="block text-xs text-muted-foreground">Each goes to someone on the client&apos;s team with the right role, or to the lead.</span>
        </Label>
      </div>
      <FormStatus state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Starting…">Start project</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={`/clients/${initial.clientId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
