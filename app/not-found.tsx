// Any address that doesn't exist (QA S8-B4): a plain page with a way back, served as a real 404.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-3 px-4">
      <h1 className="text-xl font-semibold tracking-tight">Not found</h1>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist, or it was removed.</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        Back to My Day
      </Link>
    </main>
  );
}
