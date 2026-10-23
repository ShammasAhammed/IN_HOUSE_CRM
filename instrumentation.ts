// Every unexpected server error goes through one place (CLAUDE.md: unexpected errors → Sentry, console for now).
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportError } = await import("./lib/server/report-error");
  reportError(err, {
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
    path: request.path,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
};
