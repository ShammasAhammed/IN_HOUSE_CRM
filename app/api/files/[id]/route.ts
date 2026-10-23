// The app's own download route for files kept in PostgreSQL (D78). Needs a signed-in person AND a link made for that
// person in the last five minutes, so a link copied into a chat never works for anyone else.
import type { NextRequest } from "next/server";
import { getServices } from "@/lib/server/container";
import { getActor, getPortalUser } from "@/lib/server/session";

const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
/**
 * Photos and downloads open with nothing able to run. PDFs are left without it: Chrome's viewer refuses to open in a
 * sandboxed page, and it already runs a PDF apart from the app (no access to its pages or cookies).
 */
const SANDBOX = { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" };

const text = (status: number, message: string) => new Response(message, { status, headers: { ...PRIVATE, "Content-Type": "text/plain; charset=utf-8" } });

/** inline for what browsers show safely (PDFs, photos), a download for the rest. */
function disposition(contentType: string, name: string): string {
  const inline = contentType === "application/pdf" || contentType.startsWith("image/");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  // Staff, or a client in the portal (Stage 11.6): either way the link must have been made for exactly this viewer.
  const actor = await getActor();
  const client = actor ? null : await getPortalUser();
  if (!actor && !client) return Response.redirect(new URL("/sign-in", request.url), 303);
  const { id } = await ctx.params;
  const r = await getServices().files.read(actor ? actor.personId : `portal:${client!.id}`, id, request.nextUrl.searchParams);
  if (!r.ok) return text(r.error.code === "forbidden" ? 403 : 404, r.error.message);
  const { bytes, contentType, name } = r.value;
  return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType }), {
    headers: {
      ...PRIVATE,
      ...(contentType === "application/pdf" ? {} : SANDBOX),
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": disposition(contentType, name),
    },
  });
}
