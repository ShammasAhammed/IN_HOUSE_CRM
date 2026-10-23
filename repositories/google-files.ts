// Google files a client works in (Stage 13.0): Sheets, Docs and Slides stay in Google; Oppllo One reads them through
// the Drive service account. The adapter never throws for Google's answers: it says what went wrong.
export type GoogleRead<T> = { ok: true; value: T } | { ok: false; reason: "not_shared" | "not_found" | "not_connected" | "error"; message: string };

export type GoogleMeta = { title: string; mimeType: string; modifiedTime: Date | null; modifiedBy: string | null };
export type SheetShape = { tabs: Array<{ title: string; rows: number; cols: number }>; namedRanges: string[] };

export interface GoogleFiles {
  readonly connected: boolean;
  /** Who files must be shared with, for Oppllo One to read them. */
  readonly serviceAccountEmail: string | null;
  meta(fileId: string): Promise<GoogleRead<GoogleMeta>>;
  sheet(spreadsheetId: string): Promise<GoogleRead<SheetShape>>;
  /** Shown values (as the sheet displays them) of a range in A1 notation or a named range. */
  values(spreadsheetId: string, range: string): Promise<GoogleRead<string[][]>>;
  /** A Google Doc (or Slides) as plain text. */
  text(fileId: string): Promise<GoogleRead<string>>;
  /** Write-back: replace one tab's contents (made when missing). Callers only ever pass "Oppllo data". */
  writeTab(spreadsheetId: string, tab: string, rows: Array<Array<string | number>>): Promise<GoogleRead<null>>;
}
