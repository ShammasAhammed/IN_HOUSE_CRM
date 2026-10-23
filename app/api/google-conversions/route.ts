// The daily CSV for Google Ads' scheduled offline-conversion import (Stage 10a.5). In Google Ads: Goals → Conversions →
// Uploads → Schedules → HTTPS, with this address including ?key=<GOOGLE_CONVERSIONS_UPLOAD_KEY>.
import { getServices } from "@/lib/server/container";

export async function GET(request: Request) {
  const csv = await getServices().conversions.googleCsv(new URL(request.url).searchParams.get("key"));
  if (csv === null) return new Response("Forbidden", { status: 403 });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
}
