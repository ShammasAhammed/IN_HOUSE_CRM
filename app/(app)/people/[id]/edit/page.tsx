import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { PersonForm } from "../../person-form";

export const metadata: Metadata = { title: "Edit person" };

export default function EditPersonPage({ params }: PageProps<"/people/[id]/edit">) {
  return (
    <>
      <PageHeader title="Edit person" />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading" />}>
        <Edit params={params} />
      </Suspense>
    </>
  );
}

async function Edit({ params }: { params: PageProps<"/people/[id]/edit">["params"] }) {
  const actor = await requireActor();
  if (!can(actor, "people.write")) return <ErrorState error={{ code: "forbidden", message: "Only HR and the owner edit people." }} />;
  const { id } = await params;
  const services = getServices();
  const [profile, departments, directory] = await Promise.all([services.people.profile(actor, id), services.people.departments(actor), services.people.directory(actor)]);
  if (!profile.ok) return <ErrorState error={profile.error} />;
  if (!departments.ok || !directory.ok) return <ErrorState error={{ code: "unexpected", message: "Couldn't load teams and people." }} />;
  const { person, private: priv } = profile.value;
  if (!priv) return <ErrorState error={{ code: "forbidden", message: "Only HR and the owner edit people." }} />;
  return (
    <PersonForm
      initial={{
        personId: person.id,
        fullName: person.fullName,
        workEmail: person.workEmail,
        workPhone: person.workPhone ?? "",
        jobTitle: person.jobTitle,
        employmentType: priv.employmentType,
        workLocation: person.workLocation,
        departmentId: priv.departmentId ?? "",
        reportsToId: priv.reportsToId ?? "",
        capacityHoursPerWeek: String(priv.capacityMinutesPerWeek / 60),
        joinDate: priv.joinDate,
        roles: person.roles,
        personalEmail: priv.personalEmail ?? "",
        personalPhone: priv.personalPhone ?? "",
        emergencyContactName: priv.emergencyContactName ?? "",
        emergencyContactPhone: priv.emergencyContactPhone ?? "",
        emergencyContactRelation: priv.emergencyContactRelation ?? "",
      }}
      departments={departments.value}
      people={directory.value.map((p) => ({ id: p.id, name: p.fullName }))}
      canGrantOwnerRoles={actor.roles.includes("owner")}
      editingSelf={person.id === actor.personId}
    />
  );
}
