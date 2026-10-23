// The month's attendance and leave for payroll, as a CSV file (HR slice 3). HR and the owner.
import type { NextRequest } from "next/server";
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";

export async function GET(request: NextRequest) {
  const actor = await getActor();
  if (!actor) return Response.redirect(new URL("/sign-in", request.url), 303);
  const month = request.nextUrl.searchParams.get("month") ?? undefined;
  const r = await getServices().attendance.payroll(actor, month);
  if (!r.ok) return new Response(r.error.message, { status: r.error.code === "forbidden" ? 403 : 400, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  return new Response(r.value.csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="oppllo-payroll-${r.value.month}.csv"`, "Cache-Control": "private, no-store" },
  });
}
