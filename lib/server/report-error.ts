// Unexpected errors go here: from instrumentation.ts (server rendering, actions, route handlers) and from any
// code that catches something it cannot handle. The single place they go (D4): the server log until the owner picks an
// alert service; then its adapter is passed to useErrorReporter() once, from lib/server/container.ts.
import type { ErrorReporter } from "@/repositories";

export const logReporter: ErrorReporter = {
  connected: false,
  label: "Server log only",
  report(error, context) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[oppllo-one] unexpected error:", message, { ...context, stack: error instanceof Error ? error.stack : undefined });
  },
};

let reporter: ErrorReporter = logReporter;

export function useErrorReporter(next: ErrorReporter) {
  reporter = next;
}

/** Settings → Trust: where errors go now. */
export const errorReporterStatus = () => ({ connected: reporter.connected, label: reporter.label });

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (reporter !== logReporter) {
    try {
      reporter.report(error, context);
    } catch (failed) {
      // The alert service itself failed: the error must still reach the log.
      return logReporter.report(error, { ...context, reporterFailed: failed instanceof Error ? failed.message : String(failed) });
    }
  }
  logReporter.report(error, context);
}
