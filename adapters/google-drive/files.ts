// Reading the Google files a client works in (Stage 13.0): Drive metadata, Sheets values (Sheets API v4) and Docs text
// (Drive export), through the same service account and sign-in as the Drive storage. Plain fetch, no googleapis.
// The only place that talks to the Sheets API (CLAUDE.md: Google only through its adapter).
import type { GoogleFiles, GoogleRead } from "@/repositories";
import { DriveError, driveSession, type DriveCredentials } from "./storage";

const DRIVE = "https://www.googleapis.com/drive/v3/files";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

/** Turns Google's refusals into a reason the screen can explain. */
async function read<T>(work: () => Promise<Response>, map: (body: unknown) => T): Promise<GoogleRead<T>> {
  try {
    const res = await work();
    if (res.status === 404) return { ok: false, reason: "not_found", message: "Google can't find that file, or it isn't shared with Oppllo One." };
    return { ok: true, value: map(await res.json()) };
  } catch (err) {
    if (err instanceof DriveError && (err.status === 403 || err.status === 401)) return { ok: false, reason: "not_shared", message: "This file isn't shared with Oppllo One's Google account." };
    return { ok: false, reason: "error", message: err instanceof Error ? err.message.slice(0, 300) : "Google didn't answer." };
  }
}

export function googleFiles(deps: { credentials: DriveCredentials; fetch?: typeof fetch; now?: () => number }): GoogleFiles {
  const call = driveSession(deps.credentials, deps.fetch ?? fetch, deps.now ?? Date.now);
  const enc = encodeURIComponent;
  return {
    connected: true,
    serviceAccountEmail: deps.credentials.clientEmail,
    meta: (id) =>
      read(
        () => call(`${DRIVE}/${enc(id)}?supportsAllDrives=true&fields=name,mimeType,modifiedTime,lastModifyingUser(displayName)`),
        (b) => {
          const f = b as { name: string; mimeType: string; modifiedTime?: string; lastModifyingUser?: { displayName?: string } };
          return { title: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : null, modifiedBy: f.lastModifyingUser?.displayName ?? null };
        },
      ),
    sheet: (id) =>
      read(
        () => call(`${SHEETS}/${enc(id)}?fields=sheets.properties(title,gridProperties(rowCount,columnCount)),namedRanges(name)`),
        (b) => {
          const s = b as { sheets?: Array<{ properties: { title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }>; namedRanges?: Array<{ name: string }> };
          return { tabs: (s.sheets ?? []).map((x) => ({ title: x.properties.title, rows: x.properties.gridProperties?.rowCount ?? 0, cols: x.properties.gridProperties?.columnCount ?? 0 })), namedRanges: (s.namedRanges ?? []).map((n) => n.name) };
        },
      ),
    values: (id, range) =>
      read(
        () => call(`${SHEETS}/${enc(id)}/values/${enc(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`),
        (b) => ((b as { values?: unknown[][] }).values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c)))),
      ),
    text: (id) =>
      read(
        async () => {
          const res = await call(`${DRIVE}/${enc(id)}/export?mimeType=text%2Fplain`);
          return res.status === 404 ? res : new Response(JSON.stringify(await res.text()), { status: 200 });
        },
        (b) => String(b),
      ),
    async writeTab(id, tab, rows) {
      const shape = await this.sheet(id);
      if (!shape.ok) return shape;
      if (!shape.value.tabs.some((t) => t.title === tab)) {
        const added = await read(() => call(`${SHEETS}/${enc(id)}:batchUpdate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) }), () => null);
        if (!added.ok) return added;
      }
      // Only this tab: cleared, then written from A1.
      const range = `'${tab.replace(/'/g, "''")}'`;
      const cleared = await read(() => call(`${SHEETS}/${enc(id)}/values/${enc(range)}:clear`, { method: "POST" }), () => null);
      if (!cleared.ok) return cleared;
      return read(() => call(`${SHEETS}/${enc(id)}/values/${enc(`${range}!A1`)}?valueInputOption=RAW`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: rows }) }), () => null);
    },
  };
}

/** Without Google keys: links still work as plain links; nothing is read. */
export function notConnectedGoogleFiles(): GoogleFiles {
  const off = async () => ({ ok: false as const, reason: "not_connected" as const, message: "Google isn't connected yet, so Oppllo One can't read this file. The link still opens it." });
  return { connected: false, serviceAccountEmail: null, meta: off, sheet: off, values: off, text: off, writeTab: off };
}
