// Files in Google Drive (plan/6-build-guide.md: "Your storage interface, Drive driver first"; D79). A Google service
// account works inside one folder of a shared drive that the owner sets up; Oppllo One makes sub-folders there
// ("people/<id>", "clients/<id>"). Links still point at the app's own download route, so every view keeps going through
// sign-in, the permission check and the audit log; nobody needs Drive access to open a document.
// The only place that talks to the Drive API (CLAUDE.md: never call Drive outside its adapter).
import { createSign, randomUUID } from "node:crypto";
import type { ClientFolders, FileStorage, LinkSigner, StoredFile } from "@/repositories";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOKEN = "https://oauth2.googleapis.com/token";
const FOLDER = "application/vnd.google-apps.folder";
/** Every call names shared drives explicitly, or Drive answers as if their files didn't exist. */
const SHARED = "supportsAllDrives=true";

export type DriveCredentials = { clientEmail: string; privateKey: string };

export type DriveDeps = {
  credentials: DriveCredentials;
  /** The shared-drive folder Oppllo One keeps its files in. */
  rootFolderId: string;
  signLink: LinkSigner;
  /** For tests. */
  fetch?: typeof fetch;
  now?: () => number;
};

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");
/** Drive's query language quotes strings with single quotes and escapes with backslashes. */
const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A signed-in Drive session: a service-account token (JWT bearer grant), reused until a minute before it expires. */
export function driveSession(credentials: DriveCredentials, http: typeof fetch, now: () => number) {
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const iat = Math.floor(now() / 1000);
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(JSON.stringify({ iss: credentials.clientEmail, scope: "https://www.googleapis.com/auth/drive", aud: TOKEN, iat, exp: iat + 3600 }));
    const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(credentials.privateKey).toString("base64url");
    const res = await http(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${signature}` }),
    });
    if (!res.ok) throw new DriveError(res.status, `Google sign-in for Drive failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expiresAt: now() + body.expires_in * 1000 };
    return token.value;
  }

  return async function call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await http(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await accessToken()}` } });
    if (!res.ok && res.status !== 404) throw new DriveError(res.status, `Google Drive said ${res.status}: ${await res.text()}`);
    return res;
  };
}

/**
 * A folder per client (ops extra): "<name>" inside the owner's clients folder, found again if it is already there.
 * Returns the folder's id and the link to open it in Drive.
 */
export function googleDriveClientFolders(deps: { credentials: DriveCredentials; parentFolderId: string; fetch?: typeof fetch; now?: () => number }): ClientFolders {
  const call = driveSession(deps.credentials, deps.fetch ?? fetch, deps.now ?? Date.now);
  return {
    connected: true,
    async ensure(name) {
      const clean = name.replace(/[\r\n]/g, " ").trim().slice(0, 200);
      const q = `${quote(deps.parentFolderId)} in parents and name = ${quote(clean)} and mimeType = '${FOLDER}' and trashed = false`;
      const found = (await (await call(`${API}/files?${SHARED}&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id)&pageSize=1&q=${encodeURIComponent(q)}`)).json()) as { files?: Array<{ id: string }> };
      let id = found.files?.[0]?.id;
      if (!id) {
        const res = await call(`${API}/files?${SHARED}&fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: clean, mimeType: FOLDER, parents: [deps.parentFolderId] }) });
        id = ((await res.json()) as { id: string }).id;
      }
      return { id, url: `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` };
    },
  };
}

export function googleDriveStorage(deps: DriveDeps): FileStorage {
  const call = driveSession(deps.credentials, deps.fetch ?? fetch, deps.now ?? Date.now);
  const now = deps.now ?? Date.now;
  const folders = new Map<string, string>();

  async function findFolder(parent: string, name: string): Promise<string | null> {
    const q = `${quote(parent)} in parents and name = ${quote(name)} and mimeType = '${FOLDER}' and trashed = false`;
    const res = await call(`${API}/files?${SHARED}&includeItemsFromAllDrives=true&corpora=allDrives&fields=files(id)&pageSize=1&q=${encodeURIComponent(q)}`);
    const body = (await res.json()) as { files?: Array<{ id: string }> };
    return body.files?.[0]?.id ?? null;
  }

  /** The Drive folder for a path like "people/<id>", made on first use when `create` is set. */
  async function folderFor(path: string, create: boolean): Promise<string | null> {
    let parent = deps.rootFolderId;
    let soFar = "";
    for (const name of path.split("/").filter(Boolean)) {
      soFar = `${soFar}/${name}`;
      const known = folders.get(soFar);
      if (known) {
        parent = known;
        continue;
      }
      let id = await findFolder(parent, name);
      if (!id) {
        if (!create) return null;
        const res = await call(`${API}/files?${SHARED}&fields=id`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
        });
        id = ((await res.json()) as { id: string }).id;
      }
      folders.set(soFar, id);
      parent = id;
    }
    return parent;
  }

  const fileUrl = (fileId: string, query = "") => `${API}/files/${encodeURIComponent(fileId)}?${SHARED}${query}`;

  return {
    provider: "google_drive",

    async upload({ folder, name, contentType, bytes }): Promise<StoredFile> {
      const parent = (await folderFor(folder, true))!;
      const boundary = `oppllo-${randomUUID()}`;
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${contentType.replace(/[\r\n]/g, "")}\r\n\r\n`),
        Buffer.from(bytes),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const res = await call(`${UPLOAD}?uploadType=multipart&${SHARED}&fields=id,size`, {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      const file = (await res.json()) as { id: string; size?: string };
      return { provider: "google_drive", location: parent, fileId: file.id, name, contentType, sizeBytes: Number(file.size ?? bytes.byteLength) };
    },

    async getLink(file, opts) {
      return deps.signLink(file, new Date(now() + opts.expiresInSeconds * 1000), opts.downloadName, opts.viewerId);
    },

    /** Moves the file to the shared drive's trash: Drive keeps it for 30 days, and an admin can restore it. */
    async delete(file) {
      if (file.provider !== "google_drive") return;
      await call(fileUrl(file.fileId), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    },

    async list(folder) {
      const parent = await folderFor(folder, false);
      if (!parent) return [];
      const q = `${quote(parent)} in parents and mimeType != '${FOLDER}' and trashed = false`;
      const res = await call(`${API}/files?${SHARED}&includeItemsFromAllDrives=true&corpora=allDrives&pageSize=1000&orderBy=createdTime&fields=files(id,name,mimeType,size)&q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string; size?: string }> };
      return (body.files ?? []).map((f) => ({ provider: "google_drive" as const, location: parent, fileId: f.id, name: f.name, contentType: f.mimeType, sizeBytes: Number(f.size ?? 0) }));
    },

    async read({ provider, fileId }) {
      if (provider !== "google_drive" || !/^[\w-]{10,}$/.test(fileId)) return null;
      const meta = await call(fileUrl(fileId, "&fields=name,mimeType,trashed"));
      if (meta.status === 404) return null;
      const info = (await meta.json()) as { name: string; mimeType: string; trashed?: boolean };
      // Google Docs and Sheets can't be downloaded as files.
      if (info.trashed || info.mimeType.startsWith("application/vnd.google-apps.")) return null;
      const res = await call(fileUrl(fileId, "&alt=media"));
      if (res.status === 404) return null;
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: info.mimeType, name: info.name };
    },
  };
}

export function notConnectedClientFolders(): ClientFolders {
  return {
    connected: false,
    async ensure() {
      throw new Error("Google Drive isn't connected (docs/google-drive.md).");
    },
  };
}
