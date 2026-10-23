// Files on tasks (Stage 9b.2): what is accepted, judged by the bytes and never the browser's word. Wider than the
// document locker: spreadsheets, slides, GIFs and plain text too. Bigger files go in Drive and are attached as a link.
import { MAX_DOCUMENT_BYTES, sniffDocumentType, type DocumentType } from "./documents";

export const MAX_TASK_FILE_BYTES = MAX_DOCUMENT_BYTES;

const XLSX: DocumentType = { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx", label: "Excel sheet" };
const PPTX: DocumentType = { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx", label: "PowerPoint" };
const GIF: DocumentType = { contentType: "image/gif", extension: "gif", label: "GIF image" };
const CSV: DocumentType = { contentType: "text/csv", extension: "csv", label: "CSV" };
const TXT: DocumentType = { contentType: "text/plain", extension: "txt", label: "Text" };

/** For the file picker's `accept`. */
export const ACCEPTED_TASK_FILE_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx,.pptx,.csv,.txt";

const startsWith = (bytes: Uint8Array, sig: readonly number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);

function contains(bytes: Uint8Array, needle: string): boolean {
  const n = [...needle].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= bytes.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** Text a person typed or exported: valid UTF-8 with no control bytes other than tabs and line breaks. */
function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
  } catch {
    return false;
  }
}

/**
 * Programs and system scripts by name (test report M6): refused even when their bytes look like plain text. Web pages
 * and code are still taken, as plain text that is only ever downloaded.
 */
const PROGRAM_EXTENSIONS = /\.(exe|msi|com|scr|bat|cmd|ps1|psm1|vbs|vbe|jse|wsf|wsh|hta|cpl|dll|sys|jar|apk|app|dmg|pkg|deb|rpm|sh|command|run|reg|lnk)$/i;

/** True for programs and scripts, judged by the name and by the bytes (Windows, Linux and Mac programs). */
export function isProgramFile(bytes: Uint8Array, name: string): boolean {
  if (PROGRAM_EXTENSIONS.test(name.trim())) return true;
  if (startsWith(bytes, [0x4d, 0x5a])) return true; // "MZ": Windows programs
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true; // ELF
  if ([[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xcf, 0xfa, 0xed, 0xfe], [0xce, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]].some((sig) => startsWith(bytes, sig))) return true; // Mach-O
  return startsWith(bytes, [0x23, 0x21]); // "#!": a script
}

/** The file's real type, or null when tasks don't take it. The name only decides between CSV and plain text. */
export function sniffTaskFileType(bytes: Uint8Array, name: string): DocumentType | null {
  if (isProgramFile(bytes, name)) return null;
  const known = sniffDocumentType(bytes);
  if (known) return known;
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return GIF;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (contains(bytes, "xl/workbook.xml")) return XLSX;
    if (contains(bytes, "ppt/presentation.xml")) return PPTX;
    return null; // other zips (archives, apps) are refused
  }
  if (isPlainText(bytes)) {
    // Never HTML or SVG: they would run in the browser. Saved as plain text, downloaded, never shown inline.
    return /\.csv$/i.test(name) ? CSV : TXT;
  }
  return null;
}
