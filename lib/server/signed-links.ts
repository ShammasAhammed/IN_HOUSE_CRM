// Signed, expiring links for files the app serves itself (plan/4-hr-module.md: "Documents stored with signed,
// expiring links rather than open URLs"). HMAC over the file (where it is stored and its id), the expiry, the download
// name and who it was made for: a link pasted into a chat stops working for anyone else, and every view still goes
// through the audit log.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { STORAGE_PROVIDERS, type StorageProvider } from "@/lib/types";
import type { FilePointer } from "@/repositories";

/** A key for file links only, derived from AUTH_SECRET so it never doubles as the session key. */
function key(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set: it also signs file links.");
  return createHmac("sha256", s).update("oppllo-one/file-link/v1").digest();
}

const mac = (provider: string, fileId: string, expires: number, name: string, viewerId: string) =>
  createHmac("sha256", key()).update(`${provider}\n${fileId}\n${expires}\n${name}\n${viewerId}`).digest("base64url");

/** "/api/files/<id>?p=…&exp=…&name=…&sig=…", valid until `expiresAt`, for `viewerId` only. */
export function signFileLink(file: Pick<FilePointer, "provider" | "fileId">, expiresAt: Date, name: string, viewerId: string): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const q = new URLSearchParams({ p: file.provider, exp: String(exp), name, sig: mac(file.provider, file.fileId, exp, name, viewerId) });
  return `/api/files/${encodeURIComponent(file.fileId)}?${q.toString()}`;
}

/** The link's file and name when this app made it for this file and this viewer, and it hasn't expired. */
export function verifyFileLink(fileId: string, params: URLSearchParams, viewerId: string, now = new Date()): { ok: true; name: string; provider: StorageProvider } | { ok: false } {
  const provider = params.get("p") ?? "";
  const exp = Number(params.get("exp"));
  const name = params.get("name") ?? "";
  const sig = params.get("sig") ?? "";
  if (!(STORAGE_PROVIDERS as readonly string[]).includes(provider)) return { ok: false };
  if (!Number.isFinite(exp) || exp * 1000 < now.getTime()) return { ok: false };
  const want = Buffer.from(mac(provider, fileId, exp, name, viewerId));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? { ok: true, name, provider: provider as StorageProvider } : { ok: false };
}
