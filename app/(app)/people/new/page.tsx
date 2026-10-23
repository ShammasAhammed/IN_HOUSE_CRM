import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { PersonForm } from "../person-form";

export const metadata: Metadata = { title: "Add person" };

export default function NewPersonPage() {
  return (
    <>
      <PageHeader title="Add a person" description="They can sign in with their Google account as soon as you save." />
      <Suspense fallback={<LoadingRows rows={6} columns={2} label="Loading the form" />}>
        <NewPerson />
      </Suspense>
    </>
  );
}

async function NewPerson() {
  const actor = await requireActor();
  if (!can(actor, "people.write")) return <ErrorState error={{ code: "forbidden", message: "Only HR and the owner add people." }} />;
  const services = getServices();
  const [departments, directory] = await Promise.all([services.people.departments(actor), services.people.directory(actor)]);
  if (!departments.ok) return <ErrorState error={departments.error} />;
  if (!directory.ok) return <ErrorState error={directory.error} />;
  return (
    <PersonForm
      initial={{
        fullName: "",
        workEmail: "",
        workPhone: "",
        jobTitle: "",
        employmentType: "full_time",
        workLocation: "office",
        departmentId: "",
        reportsToId: "",
        capacityHoursPerWeek: "40",
        joinDate: istDate(),
        roles: [],
        personalEmail: "",
        personalPhone: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        emergencyContactRelation: "",
      }}
      departments={departments.value}
      people={directory.value.map((p) => ({ id: p.id, name: p.fullName }))}
      canGrantOwnerRoles={actor.roles.includes("owner")}
      editingSelf={false}
    />
  );
}
