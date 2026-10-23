import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { istDate } from "@/lib/dates";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectFromTemplate } from "../../../../tasks/setup-forms";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage({ params, searchParams }: PageProps<"/clients/[id]/projects/new">) {
  return (
    <Suspense fallback={<LoadingRows rows={5} columns={2} label="Loading the form" />}>
      <NewProject params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NewProject({ params, searchParams }: Pick<PageProps<"/clients/[id]/projects/new">, "params" | "searchParams">) {
  const actor = await requireActor();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [form, templates] = await Promise.all([getServices().projects.newForm(actor, id), getServices().taskSetup.templates(actor, "project")]);
  if (!form.ok) return <ErrorState error={form.error} />;
  const f = form.value;
  const wanted = typeof query.engagement === "string" ? query.engagement : "";
  const engagementId = f.engagements.some((e) => e.id === wanted) ? wanted : (f.engagements[0]?.id ?? "");
  return (
    <div className="space-y-5">
      <Link href={`/clients/${f.clientId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {f.clientName}
      </Link>
      <PageHeader title="Start a project" description="It gets the service's stages and, if you like, its starter tasks, owned by the client's team." />
      <ProjectForm
        initial={{ clientId: f.clientId, engagementId, name: "", leadId: f.leadStrategistId ?? "", startDate: istDate(), dueDate: "", description: "" }}
        engagements={f.engagements}
        people={f.people}
      />
      <Card>
        <CardHeader>
          <CardTitle>Or start from a project template</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectFromTemplate clientId={f.clientId} templates={templates.ok ? templates.value.templates : []} people={f.people.map((p) => ({ id: p.id, name: p.fullName }))} today={istDate()} />
        </CardContent>
      </Card>
    </div>
  );
}
