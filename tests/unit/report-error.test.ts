// Error alerts (Stage 11.7): one place for unexpected errors; the log is never skipped.
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorReporterStatus, logReporter, reportError, useErrorReporter } from "@/lib/server/report-error";

afterEach(() => {
  useErrorReporter(logReporter);
  vi.restoreAllMocks();
});

describe("reportError", () => {
  it("logs to the server log by default and says nobody is alerted", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("boom"), { where: "test" });
    expect(log).toHaveBeenCalledWith("[oppllo-one] unexpected error:", "boom", expect.objectContaining({ where: "test" }));
    expect(errorReporterStatus()).toEqual({ connected: false, label: "Server log only" });
  });

  it("sends to a connected service and still logs; a failing service never loses the error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: unknown[] = [];
    useErrorReporter({ connected: true, label: "Alerts", report: (e) => sent.push(e) });
    reportError("x");
    expect(sent).toEqual(["x"]);
    expect(log).toHaveBeenCalledTimes(1);
    useErrorReporter({ connected: true, label: "Down", report: () => { throw new Error("service down"); } });
    reportError("y");
    expect(log).toHaveBeenLastCalledWith("[oppllo-one] unexpected error:", "y", expect.objectContaining({ reporterFailed: "service down" }));
  });
});
