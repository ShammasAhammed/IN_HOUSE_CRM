// A request form's public page (Stage 9b.5): no sign-in, no app frame, nothing about the client but the form itself.
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getServices } from "@/lib/server/container";
import { FillForm } from "../../(app)/requests/form-ui";
import { submitPublicRequestAction } from "./actions";

export const metadata: Metadata = { title: "Request", robots: { index: false, follow: false } };

export default function PublicRequestPage({ params }: PageProps<"/r/[slug]">) {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Image src="/oppllo-icon.png" alt="" width={24} height={24} className="rounded-md" />
        <span className="text-sm font-semibold">Oppllo Digital</span>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the form…</p>}>
        <PublicForm params={params} />
      </Suspense>
    </main>
  );
}

async function PublicForm({ params }: Pick<PageProps<"/r/[slug]">, "params">) {
  const { slug } = await params;
  const r = await getServices().requestForms.getPublic(slug);
  // An unknown or switched-off link is a real 404, so it's never mistaken for a working page (test report L7).
  if (!r.ok) notFound();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{r.value.name}</h1>
        {r.value.description ? <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{r.value.description}</p> : null}
      </div>
      <div className="rounded-lg border bg-card p-4 shadow-card">
        <FillForm questions={r.value.questions} action={submitPublicRequestAction} hidden={{ slug }} askName />
      </div>
    </div>
  );
}
