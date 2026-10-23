"use client";

// Unexpected failures (bugs, the database being down). Expected failures are shown by each screen.
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNewVersionError, reloadKeepingDrafts } from "@/components/shell/new-version";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  if (isNewVersionError(error))
    return (
      <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
        <h1 className="font-semibold">A new version of Oppllo One is ready</h1>
        <p className="mt-1 text-sm text-muted-foreground">This page was opened before the update, so it can&apos;t save. Reload: anything you typed is put back.</p>
        <Button className="mt-4" onClick={reloadKeepingDrafts}>
          Reload
        </Button>
      </div>
    );
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center text-center">
      <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Something went wrong on our side. Try again; if it keeps happening, tell the owner{error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <Button className="mt-4" variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
