// The Google Drive adapter (D79) against a fake Drive: the requests it makes, not Google's answers to them.
// A live check needs the owner's service account (docs/google-drive.md).
import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { googleDriveClientFolders, googleDriveStorage } from "@/adapters/google-drive/storage";
import { storageRouter } from "@/adapters/storage-router";
import type { FileStorage } from "@/repositories";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

type Call = { method: string; url: URL; body: string };

/** A tiny Drive: folders and files by id, trash, and a token endpoint. */
function fakeDrive() {
  const calls: Call[] = [];
  const items = new Map<string, { name: string; mimeType: string; parent: string; trashed: boolean; data?: Buffer }>();
  let next = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const raw = init?.body instanceof URLSearchParams ? init.body.toString() : init?.body ? Buffer.from(init.body as Buffer).toString("latin1") : "";
    calls.push({ method, url, body: raw });
    if (url.hostname === "oauth2.googleapis.com") return json({ access_token: `token-${calls.length}`, expires_in: 3600 });
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q")!;
      const parent = /'([^']+)' in parents/.exec(q)![1]!;
      const name = /name = '([^']+)'/.exec(q)?.[1];
      const folders = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      const files = [...items].filter(([, f]) => f.parent === parent && !f.trashed && (name ? f.name === name : true) && (folders ? f.mimeType.endsWith("folder") : !f.mimeType.endsWith("folder")));
      return json({ files: files.map(([id, f]) => ({ id, name: f.name, mimeType: f.mimeType, size: String(f.data?.length ?? 0) })) });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const meta = JSON.parse(raw) as { name: string; mimeType: string; parents: string[] };
      const id = `folder${++next}xxxxxxxx`;
      items.set(id, { name: meta.name, mimeType: meta.mimeType, parent: meta.parents[0]!, trashed: false });
      return json({ id });
    }
    if (url.pathname === "/upload/drive/v3/files") {
      const boundary = /boundary=(.+)$/.exec(new Headers(init?.headers).get("Content-Type")!)![1]!;
      const [, metaPart, filePart] = raw.split(`--${boundary}`);
      const meta = JSON.parse(metaPart!.split("\r\n\r\n")[1]!) as { name: string; parents: string[] };
      const type = /Content-Type: (\S+)/.exec(filePart!)![1]!;
      const data = Buffer.from(filePart!.split("\r\n\r\n")[1]!.replace(/\r\n$/, ""), "latin1");
      const id = `file${++next}xxxxxxxxxx`;
      items.set(id, { name: meta.name, mimeType: type, parent: meta.parents[0]!, trashed: false, data });
      return json({ id, size: String(data.length) });
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const f = items.get(decodeURIComponent(one[1]!));
      if (!f) return json({ error: { message: "File not found" } }, 404);
      if (method === "PATCH") {
        Object.assign(f, JSON.parse(raw));
        return json({});
      }
      if (url.searchParams.get("alt") === "media") return new Response(new Uint8Array(f.data!));
      return json({ name: f.name, mimeType: f.mimeType, trashed: f.trashed });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  }) as typeof globalThis.fetch;
  return { fetch: fakeFetch, calls, items };
}

const drive = (fake: ReturnType<typeof fakeDrive>, now = () => 1_790_000_000_000) =>
  googleDriveStorage({
    credentials: { clientEmail: "oppllo-one@oppllo.iam.gserviceaccount.com", privateKey },
    rootFolderId: "ROOT",
    signLink: (file, expiresAt, name, viewerId) => `/api/files/${file.fileId}?p=${file.provider}&exp=${expiresAt.getTime()}&name=${name}&v=${viewerId}`,
    fetch: fake.fetch,
    now,
  });

const pdf = new TextEncoder().encode("%PDF-1.7\nhello\n%%EOF");

describe("the Google Drive adapter", () => {
  it("signs in as the service account with a JWT Google can verify, once an hour", async () => {
    const fake = fakeDrive();
    const store = drive(fake);
    await store.upload({ folder: "people/p1", name: "Offer letter.pdf", contentType: "application/pdf", bytes: pdf });
    await store.upload({ folder: "people/p1", name: "Agreement.pdf", contentType: "application/pdf", bytes: pdf });
    const tokenCalls = fake.calls.filter((c) => c.url.hostname === "oauth2.googleapis.com");
    expect(tokenCalls).toHaveLength(1);
    const form = new URLSearchParams(tokenCalls[0]!.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [head, claims, sig] = form.get("assertion")!.split(".");
    expect(createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toMatchObject({ iss: "oppllo-one@oppllo.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token" });
  });

  it("makes the folders once, uploads into them, and hands back a pointer", async () => {
    const fake = fakeDrive();
    const store = drive(fake);
    const a = await store.upload({ folder: "people/p1", name: "Offer letter.pdf", contentType: "application/pdf", bytes: pdf });
    await store.upload({ folder: "people/p1", name: "Agreement.pdf", contentType: "application/pdf", bytes: pdf });
    const folders = [...fake.items.values()].filter((i) => i.mimeType.endsWith("folder")).map((f) => [f.name, f.parent]);
    expect(folders).toEqual([
      ["people", "ROOT"],
      ["p1", expect.stringMatching(/^folder/)],
    ]);
    expect(fake.calls.filter((c) => c.method === "GET" && c.url.pathname === "/drive/v3/files")).toHaveLength(2);
    expect(a).toMatchObject({ provider: "google_drive", name: "Offer letter.pdf", contentType: "application/pdf", sizeBytes: pdf.byteLength });
    expect(fake.items.get(a.fileId)!.parent).toBe(a.location);
    expect(fake.items.get(a.fileId)!.data!.toString()).toBe("%PDF-1.7\nhello\n%%EOF");
  });

  it("reads a file back, and nothing once it's in the trash or gone", async () => {
    const fake = fakeDrive();
    const store = drive(fake);
    const a = await store.upload({ folder: "people/p1", name: "Offer letter.pdf", contentType: "application/pdf", bytes: pdf });
    const back = await store.read(a);
    expect(back && new TextDecoder().decode(back.bytes)).toBe("%PDF-1.7\nhello\n%%EOF");
    expect(back).toMatchObject({ contentType: "application/pdf", name: "Offer letter.pdf" });
    expect(await store.list("people/p1")).toHaveLength(1);
    await store.delete(a);
    expect(fake.items.get(a.fileId)!.trashed).toBe(true);
    expect(await store.read(a)).toBeNull();
    expect(await store.list("people/p1")).toEqual([]);
    expect(await store.read({ provider: "google_drive", fileId: "missing-file-id" })).toBeNull();
    expect(await store.read({ provider: "postgres", fileId: a.fileId })).toBeNull();
  });

  it("lists nothing for a folder that doesn't exist, without making it", async () => {
    const fake = fakeDrive();
    expect(await drive(fake).list("clients/c9")).toEqual([]);
    expect(fake.calls.some((c) => c.method === "POST" && c.url.hostname.endsWith("googleapis.com") && c.url.hostname !== "oauth2.googleapis.com")).toBe(false);
  });

  it("refuses a name that would break out of Drive's query quotes", async () => {
    const fake = fakeDrive();
    await drive(fake).list("x' or name != 'y");
    const q = fake.calls.find((c) => c.url.searchParams.get("q")?.includes("name ="))!.url.searchParams.get("q")!;
    expect(q).toContain("name = 'x\\' or name != \\'y'");
  });

  it("links to the app's own route, for one viewer", async () => {
    const store = drive(fakeDrive());
    const link = await store.getLink({ provider: "google_drive", location: "F", fileId: "abc1234567890" }, { expiresInSeconds: 300, downloadName: "a.pdf", viewerId: "v1" });
    expect(link).toBe(`/api/files/abc1234567890?p=google_drive&exp=${1_790_000_000_000 + 300_000}&name=a.pdf&v=v1`);
  });
});

describe("the storage router", () => {
  it("puts new files in the primary store and reads each file where it is", async () => {
    const old: FileStorage = {
      provider: "postgres",
      upload: async () => {
        throw new Error("not the primary");
      },
      getLink: async (f) => `/old/${f.fileId}`,
      delete: async () => {},
      list: async () => [],
      read: async (f) => (f.provider === "postgres" ? { bytes: new Uint8Array([1]), contentType: "application/pdf", name: "old.pdf" } : null),
    };
    const fake = fakeDrive();
    const router = storageRouter(drive(fake), [old]);
    const a = await router.upload({ folder: "people/p1", name: "new.pdf", contentType: "application/pdf", bytes: pdf });
    expect(a.provider).toBe("google_drive");
    expect((await router.read({ provider: "postgres", fileId: "x" }))?.name).toBe("old.pdf");
    expect((await router.read(a))?.name).toBe("new.pdf");
    expect(await router.getLink({ provider: "postgres", location: "stored_files", fileId: "x" }, { expiresInSeconds: 60, downloadName: "x", viewerId: "v" })).toBe("/old/x");
    await expect(router.getLink({ provider: "r2", location: "b", fileId: "x" }, { expiresInSeconds: 60, downloadName: "x", viewerId: "v" })).rejects.toThrow(/r2/);
  });
});

describe("client folders", () => {
  it("makes the client's folder once, then finds it again", async () => {
    const fake = fakeDrive();
    const folders = googleDriveClientFolders({ credentials: { clientEmail: "sa@x.iam.gserviceaccount.com", privateKey }, parentFolderId: "clientsRoot", fetch: fake.fetch });
    const a = await folders.ensure("Zenith IAS Academy");
    const b = await folders.ensure("Zenith IAS Academy");
    expect(a).toEqual(b);
    expect(a.url).toBe(`https://drive.google.com/drive/folders/${a.id}`);
    expect([...fake.items.values()].filter((f) => f.name === "Zenith IAS Academy" && f.parent === "clientsRoot")).toHaveLength(1);
  });
});
