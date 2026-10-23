// A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, a BOM.
// Pure and dependency-free so it runs in the browser (the ClickUp import reads the file there).

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip blank lines.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else field += c;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

/** Rows as objects keyed by the header row (trimmed). Missing cells are "". */
export function csvRecords(text: string): { headers: string[]; records: Array<Record<string, string>> } {
  const [head = [], ...body] = parseCsv(text);
  const headers = head.map((h) => h.trim());
  return { headers, records: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]))) };
}

/** One CSV cell, safe to open in Excel: quoted when needed, and never read as a formula (= + - @ at the start). */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A whole CSV file with a byte-order mark, so Excel reads Malayalam and other text right. */
export function toCsv(head: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return "\uFEFF" + [head.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}
