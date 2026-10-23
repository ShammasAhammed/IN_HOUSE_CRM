// A client's linked files (Stage 13.0): reading pasted links, how much of a sheet is read at once, artifact checks.
// Pure: no I/O, unit-tested.
import type { ClientLinkKind, GoogleType } from "@/lib/types";

/** Rows read from a tab at a time, and the most cells in one answer; more is read in parts. */
export const MAX_ROWS = 200;
export const MAX_CELLS = 5000;
/** A doc's or artifact's text, per part. */
export const MAX_TEXT = 20_000;
export const CACHE_MINUTES = 15;
export const MAX_ARTIFACT_BYTES = 3_500_000;
/** The only tab write-back ever touches. */
export const WRITE_BACK_TAB = "Oppllo data";

export type ParsedLink = { kind: "google"; googleType: GoogleType; googleId: string } | { kind: "artifact" } | { kind: "other" };

/** What a pasted link is: a Google file (and its id), a Claude artifact, or anything else. */
export function parseLink(raw: string): ParsedLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const id = "([A-Za-z0-9_-]{10,})";
  if (u.hostname === "docs.google.com") {
    for (const [path, googleType] of [
      ["spreadsheets", "sheet"],
      ["document", "doc"],
      ["presentation", "slides"],
    ] as const) {
      const m = new RegExp(`^/${path}/d/${id}`).exec(u.pathname);
      if (m) return { kind: "google", googleType, googleId: m[1]! };
    }
  }
  if (u.hostname === "drive.google.com") {
    const m = new RegExp(`^/file/d/${id}`).exec(u.pathname);
    const open = u.searchParams.get("id");
    if (m || (open && /^[A-Za-z0-9_-]{10,}$/.test(open))) return { kind: "google", googleType: "file", googleId: m ? m[1]! : open! };
  }
  if ((u.hostname === "claude.ai" && /^\/(public\/)?artifacts?\//.test(u.pathname)) || u.hostname === "claude.site") return { kind: "artifact" };
  return { kind: "other" };
}

export function kindFor(p: ParsedLink): ClientLinkKind {
  if (p.kind === "artifact") return "artifact";
  if (p.kind === "google") return p.googleType === "sheet" ? "workbook" : p.googleType === "doc" ? "doc" : p.googleType === "slides" ? "slides" : "other";
  return "other";
}

/** Google's editor, for a frame (where the viewer is signed in to Google with access) and for "Open in Google". */
export function googleEditUrl(type: GoogleType, id: string): string {
  if (type === "sheet") return `https://docs.google.com/spreadsheets/d/${id}/edit`;
  if (type === "doc") return `https://docs.google.com/document/d/${id}/edit`;
  if (type === "slides") return `https://docs.google.com/presentation/d/${id}/edit`;
  return `https://drive.google.com/file/d/${id}/view`;
}

/** A tab's rows from `startRow` (1-based), the first 26 columns, in A1 notation. */
export function tabRange(tab: string, startRow: number): string {
  const start = Math.max(1, Math.floor(startRow));
  return `'${tab.replace(/'/g, "''")}'!A${start}:Z${start + MAX_ROWS - 1}`;
}

/** A named range (PlannedBudget) or an A1 range on one tab ('Media plan'!B2:D20): nothing else is read. */
export const isNamedRange = (r: string) => /^[A-Za-z_][A-Za-z0-9_.]{0,99}$/.test(r);
export function rangeTab(r: string): string | null {
  const m = /^'((?:[^']|'')+)'!\$?[A-Z]{1,3}\$?\d{0,7}(:\$?[A-Z]{1,3}\$?\d{0,7})?$/.exec(r) ?? /^([A-Za-z0-9_ ]+)!\$?[A-Z]{1,3}\$?\d{0,7}(:\$?[A-Z]{1,3}\$?\d{0,7})?$/.exec(r);
  return m ? m[1]!.replace(/''/g, "'") : null;
}

/** At most MAX_CELLS cells; says when it cut. */
export function clip(rows: string[][]): { rows: string[][]; cut: boolean } {
  const out: string[][] = [];
  let cells = 0;
  for (const row of rows) {
    if (cells + row.length > MAX_CELLS) return { rows: out, cut: true };
    out.push(row);
    cells += row.length;
  }
  return { rows: out, cut: false };
}

/** Rows as tab-separated text (what the AI reads). */
export const asText = (rows: string[][]) => rows.map((r) => r.join("\t").replace(/\s+$/, "")).join("\n");

/** An artifact page's format from its name. */
export function artifactFormat(fileName: string): "html" | "md" | null {
  const ext = fileName.toLowerCase().split(".").pop();
  return ext === "html" || ext === "htm" ? "html" : ext === "md" || ext === "markdown" ? "md" : null;
}

/** Real UTF-8 text, nothing binary. */
export function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** What an HTML page says, for the AI: no scripts, styles or tags. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
