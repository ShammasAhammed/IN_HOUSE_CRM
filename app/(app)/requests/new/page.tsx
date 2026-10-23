import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { editorOptions } from "../editor-data";
import { FormBuilder } from "../form-ui";

export const metadata: Metadata = { title: "New request form" };

export default function NewFormPage() {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={2} label="Loading" />}>
      <NewForm />
    </Suspense>
  );
}

async function NewForm() {
  const actor = await requireActor();
  if (!can(actor, "projects.write")) return <ErrorState error={{ code: "forbidden", message: "Only strategists and the owner set up request forms." }} />;
  const { projects, people } = await editorOptions(actor);
  return (
    <div className="max-w-2xl space-y-4">
      <BackLink fallback="/requests" />
      <PageHeader title="New request form" description="Each request sent through it becomes a task in the project you pick." />
      <FormBuilder initial={{ name: "", description: "", projectId: "", ownerId: "", active: true, public: false, questions: [] }} projects={projects} people={people} />
    </div>
  );
}
