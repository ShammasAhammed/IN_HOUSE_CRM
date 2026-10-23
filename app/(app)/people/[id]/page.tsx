import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pencil } from "lucide-react";
import { PersonHeader } from "@/components/person-header";
import { ErrorState, LoadingRows, SuccessNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { istDate } from "@/lib/dates";
import { countOf, formatDate, formatHours } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { EMPLOYMENT_TYPE_LABELS, LETTER_KIND_LABELS } from "@/lib/types";
import { can } from "@/services/permissions";
import { daysLabel } from "@/services/rules/leave";
import { AccessPanel, ChecklistPanel } from "./access-panel";
import { DocumentsPanel } from "./documents-panel";
import { ConsentPanel } from "../../consent/consent-panel";
import { MarkLeftForm, MyContactForm } from "./profile-forms";
import { OneToOneForm, RemoveOneToOne, WithdrawLetter } from "../talent-forms";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage({ params, searchParams }: PageProps<"/people/[id]">) {
  // Documents and access load alongside the profile, not after it.
  return (
    <div className="space-y-5">
      <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading profile" />}>
        <Profile params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <Documents params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <AccessAndChecklists params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <TalentPanels params={params} />
      </Suspense>
      <Suspense fallback={null}>
        <Consent params={params} />
      </Suspense>
    </div>
  );
}

/** DPDP consent (Stage 11.7): HR, the owner and the person themselves. */
async function Consent({ params }: { params: PageProps<"/people/[id]">["params"] }) {
  const { id } = await params;
  return <ConsentPanel subjectType="person" subjectId={id} />;
}

/** HR slice 3 on the profile: one-to-ones (person, lead, HR), letters (person, HR), the intern page link. */
async function TalentPanels({ params }: { params: PageProps<"/people/[id]">["params"] }) {
  const actor = await requireActor();
  const { id } = await params;
  const services = getServices();
  const [ones, profile] = await Promise.all([services.talent.oneToOnes(actor, id), services.people.profile(actor, id)]);
  const hr = can(actor, "people.write");
  const self = actor.personId === id;
  const letters = hr || self ? await services.talent.letters(actor, id) : [];
  const intern = profile.ok && profile.value.person.roles.includes("intern");
  if (!ones.ok && !letters.length && !hr && !intern) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
      {ones.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>One-to-ones</CardTitle>
            {ones.value.lastDays !== null ? <span className={ones.value.lastDays > 42 ? "text-xs text-warning" : "text-xs text-muted-foreground"}>last met {ones.value.lastDays === 0 ? "today" : ones.value.lastDays === 1 ? "yesterday" : `${countOf(ones.value.lastDays, "day")} ago`}</span> : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {ones.value.items.length ? (
              <ul className="space-y-3">
                {ones.value.items.map((o) => (
                  <li key={o.id} className="rounded-md bg-subtle p-3 text-sm">
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {formatDate(o.meetingDate)} · {o.leadName}
                      </span>
                      {o.leadId === actor.personId || hr ? <RemoveOneToOne id={o.id} /> : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{o.discussed}</p>
                    {o.agreed ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">Agreed: {o.agreed}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No one-to-ones noted yet.</p>
            )}
            {ones.value.canAdd && !self ? <OneToOneForm personId={id} today={istDate()} /> : null}
          </CardContent>
        </Card>
      ) : null}
      {hr || letters.length || intern ? (
        <Card>
          <CardHeader>
            <CardTitle>Letters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {letters.length ? (
              <ul className="space-y-1 text-sm">
                {letters.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <Link href={`/letters/${l.id}` as Route} className="hover:underline">
                      {LETTER_KIND_LABELS[l.kind]} · {l.refNo} · {formatDate(l.issuedOn)}
                    </Link>
                    {hr ? <WithdrawLetter id={l.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No letters issued.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {hr ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/people/${id}/letter` as Route}>Issue a letter</Link>
                </Button>
              ) : null}
              {intern && (hr || !self) ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/people/interns/${id}` as Route}>Intern page</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

async function Profile({ params, searchParams }: { params: PageProps<"/people/[id]">["params"]; searchParams: PageProps<"/people/[id]">["searchParams"] }) {
  const actor = await requireActor();
  const [{ id }, { done }] = await Promise.all([params, searchParams]);
  const services = getServices();
  const result = await services.people.profile(actor, id);
  if (!result.ok) return <ErrorState error={result.error} />;
  const { person, private: priv, canEdit, canEditOwnContact } = result.value;
  const self = person.id === actor.personId;
  const balances = priv ? await services.leave.balancesFor(actor, person.id) : null;

  return (
    <div className="space-y-5">
      {done === "created" ? <SuccessNotice>Added. They can sign in with {person.workEmail} now.</SuccessNotice> : null}
      {done === "updated" ? <SuccessNotice>Saved.</SuccessNotice> : null}
      <PersonHeader
        person={person}
        actions={
          canEdit ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link href={`/people/${person.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              {person.status === "active" && !self ? <MarkLeftForm personId={person.id} name={person.fullName} today={istDate()} /> : null}
            </>
          ) : null
        }
      />

      {priv ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Employment</CardTitle>
              {!self ? <span className="text-xs text-muted-foreground">Private · your view is logged</span> : null}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <Detail label="Type">{EMPLOYMENT_TYPE_LABELS[priv.employmentType]}</Detail>
                <Detail label="Joined">{formatDate(priv.joinDate)}</Detail>
                <Detail label="Project hours a week">{formatHours(priv.capacityMinutesPerWeek)}</Detail>
                {priv.endDate ? <Detail label="Left">{formatDate(priv.endDate)}</Detail> : null}
                {!canEditOwnContact ? (
                  <>
                    <Detail label="Personal phone">{priv.personalPhone}</Detail>
                    <Detail label="Personal email">{priv.personalEmail}</Detail>
                    <Detail label="Emergency contact">
                      {priv.emergencyContactName ? `${priv.emergencyContactName}${priv.emergencyContactRelation ? ` (${priv.emergencyContactRelation})` : ""}` : null}
                    </Detail>
                    <Detail label="Their phone">{priv.emergencyContactPhone}</Detail>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          {balances && !balances.ok ? <ErrorState error={balances.error} /> : null}
          {balances?.ok ? (
            <Card>
              <CardHeader>
                <CardTitle>Leave this year</CardTitle>
                {self ? (
                  <Link href="/leave" className="text-xs text-primary hover:underline">
                    My leave
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {balances.value.map((b) => (
                    <li key={b.leaveTypeId} className="flex items-center justify-between gap-3 text-sm">
                      <span>{b.name}</span>
                      <span className="tabular text-muted-foreground">
                        {b.availableHalfDays === null ? `${daysLabel(b.usedHalfDays)} taken` : `${daysLabel(b.availableHalfDays)} left · ${daysLabel(b.usedHalfDays)} taken`}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {canEditOwnContact && priv ? (
        <Card>
          <CardHeader>
            <CardTitle>Your contact details</CardTitle>
            <span className="text-xs text-muted-foreground">Only you, HR and the owner see the personal ones.</span>
          </CardHeader>
          <CardContent>
            <MyContactForm
              initial={{
                workPhone: person.workPhone ?? "",
                personalPhone: priv.personalPhone ?? "",
                personalEmail: priv.personalEmail ?? "",
                emergencyContactName: priv.emergencyContactName ?? "",
                emergencyContactPhone: priv.emergencyContactPhone ?? "",
                emergencyContactRelation: priv.emergencyContactRelation ?? "",
              }}
            />
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}

/** The document locker (HR slice 2): HR and the owner keep it; you see your own. Nothing shows for anyone else. */
async function Documents({ params }: { params: PageProps<"/people/[id]">["params"] }) {
  const [actor, { id }] = await Promise.all([requireActor(), params]);
  const self = id === actor.personId;
  if (!self && !can(actor, "hr.documents")) return null;
  const r = await getServices().documents.forPerson(actor, id);
  // A missing person is already explained by the profile above.
  if (!r.ok) return r.error.code === "not_found" ? null : <ErrorState error={r.error} />;
  return <DocumentsPanel personId={id} data={r.value} today={istDate()} self={self} />;
}

/** The access register and joining/exit checklists (HR slice 2): HR and the owner keep them; you see your own. */
async function AccessAndChecklists({ params }: { params: PageProps<"/people/[id]">["params"] }) {
  const [actor, { id }] = await Promise.all([requireActor(), params]);
  const self = id === actor.personId;
  if (!self && !can(actor, "access.manage")) return null;
  const r = await getServices().access.forPerson(actor, id);
  if (!r.ok) return r.error.code === "not_found" ? null : <ErrorState error={r.error} />;
  const { active } = r.value;
  const showChecklists = r.value.canManage || r.value.checklists.joining.length > 0 || r.value.checklists.exit.length > 0;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <AccessPanel personId={id} data={r.value} today={istDate()} active={active} self={self} />
      {showChecklists ? <ChecklistPanel personId={id} data={r.value} active={active} /> : null}
    </div>
  );
}
