import Image from "next/image";

/** The portal's signed-out pages: just the Oppllo mark and one card. */
export default function OpenLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-sm text-center">
        <Image src="/oppllo-logo.png" alt="Oppllo" width={130} height={44} className="mx-auto mb-6 h-auto w-[130px] dark:invert" priority />
        <div className="rounded-xl border bg-card p-6 text-left shadow-pop">{children}</div>
      </div>
    </main>
  );
}
