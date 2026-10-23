import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, GraduationCap, ListChecks, UserPlus, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { can } from "@/services/permissions";
import { Directory } from "./directory";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage({ searchParams }: PageProps<"/people">) {
  return (
    <>
      <PageHeader
        title="People"
        description="Everyone at Oppllo: who does what and how to reach them."
        actions={
          <Suspense fallback={null}>
            <AddButton />
          </Suspense>
        }
      />
      <Suspense fallback={<LoadingRows rows={6} columns={3} label="Loading the team" />}>
        <People searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AddButton() {
  const actor = await requireActor();
  if (!can(actor, "people.write")) return null;
  return (
    <>
      <Button asChild size="sm" variant="outline">
        <Link href="/people/interns">
          <GraduationCap /> Interns
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/people/letters">
          <FileText /> Letters
        </Link>
      </Button>
      {can(actor, "people.write") ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/people/teams">
            <UsersRound /> Teams
          </Link>
        </Button>
      ) : null}
      {can(actor, "access.manage") ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/people/checklists">
            <ListChecks /> Checklists
          </Link>
        </Button>
      ) : null}
      <Button asChild size="sm">
        <Link href="/people/new">
          <UserPlus /> Add person
        </Link>
      </Button>
    </>
  );
}

async function People({ searchParams }: { searchParams: PageProps<"/people">["searchParams"] }) {
  const actor = await requireActor();
  const { show } = await searchParams;
  const includeLeft = show === "all" && can(actor, "people.private.read");
  const result = await getServices().people.directory(actor, { includeLeft });
  if (!result.ok) return <ErrorState error={result.error} />;
  return (
    <div className="space-y-3">
      <Directory people={result.value} />
      {can(actor, "people.private.read") ? (
        <p className="text-xs text-muted-foreground">
          {includeLeft ? (
            <Link href="/people" className="text-primary hover:underline">
              Hide people who left
            </Link>
          ) : (
            <Link href="/people?show=all" className="text-primary hover:underline">
              Include people who left
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}
