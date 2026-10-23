import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { BackLink } from "@/components/back-link";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { editorOptions } from "../../editor-data";
import { FormBuilder, RemoveForm } from "../../form-ui";

export const metadata: Metadata = { title: "Edit request form" };

export default function EditFormPage({ params }: PageProps<"/requests/[id]/edit">) {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={2} label="Loading" />}>
      <EditForm params={params} />
    </Suspense>
  );
}

async function EditForm({ params }: Pick<PageProps<"/requests/[id]/edit">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const r = await getServices().requestForms.get(actor, id);
  if (!r.ok) return <ErrorState error={r.error} />;
  if (!r.value.canManage) return <ErrorState error={{ code: "forbidden", message: "Only strategists and the owner change request forms." }} />;
  const f = r.value;
  const { projects, people } = await editorOptions(actor);
  return (
    <div className="max-w-2xl space-y-4">
      <BackLink fallback={`/requests/${f.id}` as Route} />
      <PageHeader title="Edit request form" actions={<RemoveForm formId={f.id} />} />
      <FormBuilder
        initial={{ formId: f.id, name: f.name, description: f.description ?? "", projectId: f.projectId, ownerId: f.ownerId ?? "", active: f.active, public: Boolean(f.publicSlug), questions: f.questions }}
        projects={projects}
        people={people}
      />
    </div>
  );
}
