// Error alerts (Stage 11.7): where unexpected errors are sent. Today the server log; Sentry or another service later is
// one adapter, set in lib/server/report-error.ts.
export interface ErrorReporter {
  /** False while errors only reach the server log (nobody is alerted). */
  readonly connected: boolean;
  /** For screens: "Server log only", "Sentry". */
  readonly label: string;
  report(error: unknown, context: Record<string, unknown>): void;
}
