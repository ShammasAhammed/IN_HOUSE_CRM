// Pure rules for the document locker: which files are accepted, what they are really (never trust the browser's
// word), safe names, and when a document needs renewing.
import { diffDays, type IsoDate } from "@/lib/dates";

/** Kept under the 4 MB server-action body limit, with room for the form fields. */
export const MAX_DOCUMENT_BYTES = 3_500_000;
/** "Expires soon" from this many days out. */
export const EXPIRY_SOON_DAYS = 30;

export type DocumentType = { contentType: string; extension: string; label: string };

const PDF: DocumentType = { contentType: "application/pdf", extension: "pdf", label: "PDF" };
const JPEG: DocumentType = { contentType: "image/jpeg", extension: "jpg", label: "JPEG image" };
const PNG: DocumentType = { contentType: "image/png", extension: "png", label: "PNG image" };
const WEBP: DocumentType = { contentType: "image/webp", extension: "webp", label: "WebP image" };
const DOCX: DocumentType = { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx", label: "Word document" };

/** What the locker takes, for the file picker's `accept`. */
export const ACCEPTED_DOCUMENT_TYPES = [PDF, JPEG, PNG, WEBP, DOCX];

const startsWith = (bytes: Uint8Array, sig: readonly number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const n = ascii(needle);
  outer: for (let i = 0; i <= bytes.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** The file's real type from its first bytes, or null when it isn't one the locker takes. */
export function sniffDocumentType(bytes: Uint8Array): DocumentType | null {
  if (startsWith(bytes, ascii("%PDF-"))) return PDF;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return WEBP;
  // A .docx is a zip holding word/document.xml; other zips (spreadsheets, archives) are refused.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && containsAscii(bytes, "word/document.xml")) return DOCX;
  return null;
}

/** A file name safe for a download header: no folders or control characters, the real extension, at most 120 long. */
export function safeFileName(name: string, type: DocumentType): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110);
  return `${base || "document"}.${type.extension}`;
}

export type Expiry = "expired" | "soon" | null;

/** Whether a document has lapsed, or lapses within EXPIRY_SOON_DAYS. */
export function documentExpiry(expiresOn: IsoDate | null, today: IsoDate): Expiry {
  if (!expiresOn) return null;
  if (expiresOn < today) return "expired";
  return diffDays(today, expiresOn) <= EXPIRY_SOON_DAYS ? "soon" : null;
}
