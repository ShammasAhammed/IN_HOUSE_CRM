// The standard states every screen ships with (CLAUDE.md → Design system): loading, empty, error, success.
import { AlertTriangle, CheckCircle2, Inbox, Lock, SearchX, type LucideIcon } from "lucide-react";
import type { AppError } from "@/lib/result";
import { cn } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";

/** Loading placeholder for a table or list: the same shape as the real thing, so nothing jumps. */
export function LoadingRows({ rows = 6, columns = 4, label = "Loading" }: { rows?: number; columns?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="overflow-hidden rounded-lg border bg-card shadow-card">
      <div className="flex h-9 items-center gap-6 border-b bg-subtle px-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-12 items-center gap-6 border-b px-3 last:border-0">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-3.5 w-48" />
          {Array.from({ length: columns - 1 }, (_, c) => (
            <Skeleton key={c} className="hidden h-3.5 w-24 sm:block" />
          ))}
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-14 text-center", className)}>
      <span className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-subtle text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** An expected failure from a service, shown in human words. */
export function ErrorState({ error, action, className }: { error: AppError; action?: React.ReactNode; className?: string }) {
  const forbidden = error.code === "forbidden";
  // Missing and not-allowed are calm, not alarming; only real failures are red.
  const missing = error.code === "not_found";
  const calm = forbidden || missing;
  const Icon = forbidden ? Lock : missing ? SearchX : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border px-6 py-14 text-center",
        calm ? "bg-card" : "border-danger/20 bg-danger-soft",
        className,
      )}
    >
      <span className={cn("mb-3 inline-flex size-10 items-center justify-center rounded-full", calm ? "bg-subtle text-muted-foreground" : "bg-card text-danger")}>
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{forbidden ? "Not available to you" : missing ? "Not found" : "Something went wrong"}</p>
      <p className="mt-1 max-w-sm text-sm text-foreground-2">{error.message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** A short confirmation after an action succeeds. */
export function SuccessNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success", className)}>
      <CheckCircle2 className="size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
