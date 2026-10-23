// An issued letter, ready to print or save as PDF (HR slice 3). Outside the app frame so it prints as a page.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Letter", robots: { index: false, follow: false } };

export default function LetterPage({ params }: PageProps<"/letters/[id]">) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-6 py-10 print:max-w-none print:p-0">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the letter…</p>}>
        <Letter params={params} />
      </Suspense>
    </main>
  );
}

async function Letter({ params }: Pick<PageProps<"/letters/[id]">, "params">) {
  const actor = await requireActor();
  const { id } = await params;
  const r = await getServices().talent.letter(actor, id);
  if (!r.ok) return <p className="text-sm text-muted-foreground">This letter isn&apos;t available.</p>;
  const l = r.value;
  return (
    <article className="space-y-6 text-sm leading-relaxed">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/people" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <header className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <Image src="/oppllo-icon.png" alt="" width={28} height={28} className="rounded-md" />
          <span className="text-base font-semibold">Oppllo Digital</span>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Ref: {l.refNo}</p>
          <p>{formatDate(l.issuedOn)}</p>
        </div>
      </header>
      <h1 className="text-center text-lg font-semibold">{l.title}</h1>
      <div className="whitespace-pre-wrap">{l.body}</div>
      <footer className="pt-12">
        <p>For Oppllo Digital</p>
        <p className="pt-10 text-muted-foreground">{l.issuedByName ?? "Authorised signatory"}</p>
      </footer>
    </article>
  );
}
