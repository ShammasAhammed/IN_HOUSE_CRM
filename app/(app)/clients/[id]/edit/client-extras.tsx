"use client";

import { Checkbox } from "@/components/ui/choice";
import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";
import { Field, FormStatus, SubmitButton, invalidProps } from "@/components/form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { fieldDefault, idle } from "@/lib/action-state";
import type { ClientContactRecord } from "@/repositories";
import { addContactAction, addMemberAction, removeContactAction, removeMemberAction, updateContactAction } from "../../actions";

/** Contact people at the client (D14: only roles that may see contact details get here). */
export function ContactsEditor({ clientId, contacts }: { clientId: string; contacts: ClientContactRecord[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <div>
        <h2 className="text-sm font-semibold">Contact people</h2>
        <p className="text-xs text-muted-foreground">The starred one shows first on the client page.</p>
      </div>
      {contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : null}
      <ul className="divide-y">
        {contacts.map((c) =>
          editing === c.id ? (
            <li key={c.id} className="py-3">
              <ContactForm contact={c} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={c.id} className="flex items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-1 font-medium">
                  {c.isPrimary ? <Star className="size-3.5 fill-primary text-primary" aria-label="Primary contact" /> : null}
                  {c.name}
                  {c.designation ? <span className="font-normal text-muted-foreground"> · {c.designation}</span> : null}
                </p>
                <p className="tabular truncate text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email"}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(c.id)}>
                Edit
              </Button>
              <ConfirmForm action={removeContactAction} fields={{ contactId: c.id }} label="Remove" variant="ghost" confirm={`Remove ${c.name} from this client's contacts?`} showSuccess={false} />
            </li>
          ),
        )}
      </ul>
      {editing === null ? <ContactForm clientId={clientId} /> : null}
    </section>
  );
}

function ContactForm({ clientId, contact, onDone }: { clientId?: string; contact?: ClientContactRecord; onDone?: () => void }) {
  const [state, action] = useActionState(async (prev: Parameters<typeof addContactAction>[0], form: FormData) => {
    const next = await (contact ? updateContactAction : addContactAction)(prev, form);
    if (next.status === "ok") onDone?.();
    return next;
  }, idle);
  const d = (name: string, initial: string | null | undefined) => fieldDefault(state, name, initial ?? "");
  const p = (name: string) => `${contact?.id ?? "new"}-${name}`;
  return (
    <form
      action={action}
      className="space-y-3"
      // React empties the form after a contact is added; after an error the remount keeps what was typed.
      key={state.status === "error" ? JSON.stringify(state.values ?? {}) : "initial"}
    >
      {contact ? <input type="hidden" name="contactId" value={contact.id} /> : <input type="hidden" name="clientId" value={clientId} />}
      {contact ? null : <p className="text-xs font-medium text-muted-foreground">Add a contact</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" name="name" htmlFor={p("name")} state={state}>
          <Input id={p("name")} name="name" required maxLength={80} defaultValue={d("name", contact?.name)} {...invalidProps(state, "name", p("name"))} />
        </Field>
        <Field label="Designation" name="designation" htmlFor={p("designation")} state={state}>
          <Input id={p("designation")} name="designation" maxLength={80} placeholder="e.g. Director" defaultValue={d("designation", contact?.designation)} />
        </Field>
        <Field label="Phone" name="phone" htmlFor={p("phone")} state={state}>
          <Input id={p("phone")} name="phone" type="tel" placeholder="+91 94470 11223" defaultValue={d("phone", contact?.phone)} {...invalidProps(state, "phone", p("phone"))} />
        </Field>
        <Field label="WhatsApp" name="whatsapp" htmlFor={p("whatsapp")} state={state}>
          <Input id={p("whatsapp")} name="whatsapp" type="tel" placeholder="If different" defaultValue={d("whatsapp", contact?.whatsapp)} {...invalidProps(state, "whatsapp", p("whatsapp"))} />
        </Field>
        <Field label="Email" name="email" htmlFor={p("email")} state={state} className="sm:col-span-2">
          <Input id={p("email")} name="email" type="email" defaultValue={d("email", contact?.email)} {...invalidProps(state, "email", p("email"))} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={p("isPrimary")} name="isPrimary" defaultChecked={contact?.isPrimary ?? false} className="size-4 accent-primary" />
        <Label htmlFor={p("isPrimary")} className="font-normal">
          Main contact
        </Label>
      </div>
      {state.status === "error" ? <FormStatus state={state} /> : null}
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" variant={contact ? "default" : "outline"} pendingLabel="Saving…">
          {contact ? "Save" : "Add contact"}
        </SubmitButton>
        {contact ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** The Oppllo people working on this client. Being on the team shows them its projects and tasks (D13). */
export function TeamEditor({
  clientId,
  team,
  people,
  leadId,
}: {
  clientId: string;
  team: Array<{ personId: string; fullName: string }>;
  people: Array<{ id: string; fullName: string }>;
  leadId: string | null;
}) {
  const [state, action] = useActionState(addMemberAction, idle);
  const onTeam = new Set(team.map((m) => m.personId));
  const choices = people.filter((p) => !onTeam.has(p.id));
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-card">
      <div>
        <h2 className="text-sm font-semibold">Oppllo team</h2>
        <p className="text-xs text-muted-foreground">Designers, editors and social media see this client&apos;s projects and files only while on its team.</p>
      </div>
      {team.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet.</p> : null}
      <ul className="space-y-1.5">
        {team.map((m) => (
          <li key={m.personId} className="flex items-center gap-2 text-sm">
            <Avatar name={m.fullName} size="sm" />
            <span className="flex-1">
              {m.fullName}
              {m.personId === leadId ? <span className="text-xs text-muted-foreground"> · lead</span> : null}
            </span>
            {m.personId === leadId ? null : (
              <ConfirmForm action={removeMemberAction} fields={{ clientId, personId: m.personId }} label="Remove" variant="ghost" showSuccess={false} />
            )}
          </li>
        ))}
      </ul>
      {choices.length ? (
        <form action={action} className="flex items-end gap-2">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="team-person">Add someone</Label>
            <Select id="team-person" name="personId" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </div>
          <SubmitButton size="sm" variant="outline">
            Add
          </SubmitButton>
        </form>
      ) : null}
      {state.status === "error" ? <FormStatus state={state} /> : null}
    </section>
  );
}
