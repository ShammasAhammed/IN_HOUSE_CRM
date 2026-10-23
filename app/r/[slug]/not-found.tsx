// An unknown or closed request link (test report L7): a real 404 with the same plain page around it.
export default function RequestNotFound() {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Form not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">This form isn&apos;t available. Ask the person who sent you the link.</p>
    </main>
  );
}
