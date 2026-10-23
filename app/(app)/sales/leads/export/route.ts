// The Leads screen's "Export CSV": the leads matching its filters (BDO and owner).
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";
import { istDate } from "@/lib/dates";

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in first.", { status: 401 });
  const p = new URL(request.url).searchParams;
  const get = (k: string) => p.get(k) ?? "";
  const r = await getServices().leads.exportCsv(actor, { q: get("q"), stage: get("stage") || "open", owner: get("owner"), tag: get("tag"), channel: get("channel"), district: get("district"), segment: get("segment"), score: get("score"), due: get("due") });
  if (!r.ok) return new Response(r.error.message, { status: r.error.code === "forbidden" ? 403 : 400 });
  return new Response(r.value.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="oppllo-leads-${istDate()}.csv"`, "Cache-Control": "no-store" } });
}
