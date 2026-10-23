// The document locker (HR slice 2, D78): files in PostgreSQL behind signed links, every view logged.
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresStorage } from "@/adapters/postgres";
import * as s from "@/db/schema";
import { createDocumentService, createFileService } from "@/services/documents";
import { actorOf, addPerson, eventsFor, fixedClock, testDb, testStore, wipe } from "./harness";

const store = testStore();
const { db, client } = testDb();
// Stand-ins for the container's HMAC signer (unit-tested in tests/unit/signed-links.test.ts): the link names its viewer.
const storage = createPostgresStorage(process.env.DATABASE_URL_TEST!, {
  signLink: ({ fileId }, expiresAt, name, viewerId) => `/files/${fileId}?exp=${expiresAt.getTime()}&name=${name}&viewer=${viewerId}`,
});
const verifyLink = (_fileId: string, params: URLSearchParams, viewerId: string) =>
  params.get("viewer") === viewerId && Number(params.get("exp")) > Date.now() ? { ok: true as const, name: params.get("name") ?? "", provider: "postgres" as const } : { ok: false as const };
const docs = createDocumentService({ store, storage, clock: fixedClock("2026-10-14") });
const files = createFileService({ storage, verifyLink });
const ids = {} as Record<"owner" | "hr" | "designer" | "editor" | "accountant", string>;
const hr = () => actorOf(ids.hr, ["hr"]);
const designer = () => actorOf(ids.designer, ["designer"]);

const pdf = (text = "offer") => ({ name: "Offer Letter.pdf", bytes: new TextEncoder().encode(`%PDF-1.7\n${text}\n%%EOF`) });

async function upload(extra: Record<string, string> = {}, file = pdf()) {
  const r = await docs.upload(hr(), { personId: ids.designer, kind: "offer_letter", title: "", expiresOn: "", ...extra }, file);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.id;
}

beforeEach(async () => {
  await wipe(db);
  ids.owner = await addPerson(db, "Faisal Rahman", ["owner"]);
  ids.hr = await addPerson(db, "Divya Suresh", ["hr"]);
  ids.designer = await addPerson(db, "Vishnu Prasad", ["designer"]);
  ids.editor = await addPerson(db, "Nikhil Thomas", ["video_editor"]);
  ids.accountant = await addPerson(db, "Joseph Mathew", ["accountant"]);
});

afterAll(async () => {
  await Promise.all([store.close(), storage.close(), client.end()]);
});

describe("uploading", () => {
  it("keeps only the last 4 digits of an ID, and keeps ID numbers out of titles (QA S5-B3)", async () => {
    const tooMany = await docs.upload(hr(), { personId: ids.designer, kind: "other", idLast4: "123456789012" }, pdf());
    expect(!tooMany.ok && tooMany.error.fieldErrors?.idLast4).toEqual(["Only the last 4 digits, like 1234."]);
    const inTitle = await docs.upload(hr(), { personId: ids.designer, kind: "other", title: "Aadhaar 1234 5678 9012" }, pdf());
    expect(!inTitle.ok && inTitle.error.fieldErrors?.title).toEqual(["Don't put ID numbers in the title. Use the last-4-digits box instead."]);
    const id = await upload({ kind: "other", title: "TEST Agreement 15-10-2026", idLast4: "9012" });
    expect((await store.documents.find(id))?.idLast4).toBe("9012");
  });

  it("HR stores the file and a pointer to it; the name and type come from the file itself", async () => {
    const id = await upload({ expiresOn: "2027-03-31" }, { name: "C:\\scans\\offer.exe", bytes: pdf().bytes });
    const [row] = await db.select().from(s.personDocuments);
    expect(row).toMatchObject({ id, kind: "offer_letter", title: "Offer letter", provider: "postgres", location: "stored_files", fileName: "offer.pdf", contentType: "application/pdf", expiresOn: "2027-03-31", uploadedById: ids.hr });
    const [file] = await db.select().from(s.storedFiles);
    expect(file).toMatchObject({ id: row!.fileId, folder: `people/${ids.designer}`, name: "offer.pdf", sizeBytes: pdf().bytes.byteLength });
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["document.uploaded"]);
  });

  it("refuses other types, big files, an unmasked ID, and anyone but HR and the owner", async () => {
    const html = await docs.upload(hr(), { personId: ids.designer, kind: "other" }, { name: "cv.pdf", bytes: new TextEncoder().encode("<html><script>x</script>") });
    expect(!html.ok && html.error.fieldErrors?.file).toBeDefined();
    const big = await docs.upload(hr(), { personId: ids.designer, kind: "other" }, { name: "scan.pdf", bytes: new Uint8Array(3_600_000).fill(0x25) });
    expect(!big.ok && big.error.message).toBe("That file is 3.6 MB; the limit is 3.5 MB.");
    const none = await docs.upload(hr(), { personId: ids.designer, kind: "other" }, null);
    expect(!none.ok && none.error.fieldErrors?.file).toEqual(["Choose a file."]);
    const aadhaar = await docs.upload(hr(), { personId: ids.designer, kind: "id_proof" }, pdf());
    expect(!aadhaar.ok && aadhaar.error.fieldErrors?.masked).toBeDefined();
    expect((await docs.upload(hr(), { personId: ids.designer, kind: "id_proof", masked: "on" }, pdf())).ok).toBe(true);
    for (const actor of [designer(), actorOf(ids.accountant, ["accountant"])]) {
      const r = await docs.upload(actor, { personId: ids.designer, kind: "other" }, pdf());
      expect(r.ok ? "ok" : r.error.code).toBe("forbidden");
    }
    expect((await docs.upload(actorOf(ids.owner, ["owner"]), { personId: ids.designer, kind: "certificate" }, pdf())).ok).toBe(true);
    // Refused uploads leave no file behind.
    expect(await db.select({ id: s.storedFiles.id }).from(s.storedFiles).where(sql`${s.storedFiles.deletedAt} is null`)).toHaveLength(2);
  });
});

describe("when saving the record fails after the file is stored", () => {
  it("takes the file out of use", async () => {
    const failing = createDocumentService({
      store: {
        ...store,
        transaction: (fn) =>
          store.transaction((repos) =>
            fn({
              ...repos,
              documents: {
                ...repos.documents,
                create: async () => {
                  throw new Error("disk full");
                },
              },
            }),
          ),
      },
      storage,
      clock: fixedClock("2026-10-14"),
    });
    await expect(failing.upload(hr(), { personId: ids.designer, kind: "offer_letter" }, pdf())).rejects.toThrow("disk full");
    const stored = await db.select({ deletedAt: s.storedFiles.deletedAt }).from(s.storedFiles);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.deletedAt).not.toBeNull();
  });
});

describe("seeing and opening", () => {
  it("you see your own, HR and the owner see anyone's, nobody else does", async () => {
    await upload();
    const mine = await docs.forPerson(designer(), ids.designer);
    expect(mine.ok && mine.value.documents.map((d) => [d.title, d.uploadedByName])).toEqual([["Offer letter", "Divya Suresh"]]);
    expect(mine.ok && mine.value.canManage).toBe(false);
    expect(JSON.stringify(mine.ok && mine.value)).not.toContain("stored_files");
    for (const actor of [actorOf(ids.editor, ["video_editor"]), actorOf(ids.accountant, ["accountant"])]) {
      const peek = await docs.forPerson(actor, ids.designer);
      expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
    }
    expect((await docs.forPerson(actorOf(ids.owner, ["owner"]), ids.designer)).ok).toBe(true);
  });

  it("opening gives a short link and logs the view, every time, for everyone", async () => {
    const id = await upload();
    const r = await docs.open(designer(), { documentId: id });
    if (!r.ok) throw new Error(r.error.message);
    const [{ fileId }] = await db.select({ fileId: s.personDocuments.fileId }).from(s.personDocuments);
    expect(r.value.url).toMatch(new RegExp(`^/files/${fileId}\\?exp=\\d+&name=Offer Letter.pdf&viewer=${ids.designer}$`));
    const link = new URL(r.value.url, "http://x").searchParams;
    const exp = Number(link.get("exp"));
    expect(exp - Date.now()).toBeGreaterThan(4 * 60_000);
    expect(exp - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    expect((await docs.open(hr(), { documentId: id })).ok).toBe(true);
    const peek = await docs.open(actorOf(ids.editor, ["video_editor"]), { documentId: id });
    expect(peek.ok ? "ok" : peek.error.code).toBe("forbidden");
    expect((await eventsFor(db, id)).map((e) => [e.action, e.actorId])).toEqual([
      ["document.uploaded", ids.hr],
      ["document.viewed", ids.designer],
      ["document.viewed", ids.hr],
    ]);
    const bytes = await files.read(designer().personId, fileId!, link);
    expect(bytes.ok && new TextDecoder().decode(bytes.value.bytes)).toContain("offer");
    // The link was made for the designer: nobody else can use it.
    const shared = await files.read(hr().personId, fileId!, link);
    expect(shared.ok ? "ok" : shared.error.code).toBe("forbidden");
    expect((await docs.open(designer(), { documentId: "not-an-id" })).ok).toBe(false);
  });
});

describe("tidying", () => {
  it("HR renames and sets expiry; removing keeps the record and file, marked deleted, and stops the file being served", async () => {
    const id = await upload();
    expect((await docs.update(hr(), { documentId: id, title: "Offer letter 2026", expiresOn: "2026-11-01" })).ok).toBe(true);
    const listed = await docs.forPerson(hr(), ids.designer);
    expect(listed.ok && listed.value.documents.map((d) => [d.title, d.expiry])).toEqual([["Offer letter 2026", "soon"]]);
    expect((await docs.update(hr(), { documentId: id, title: "Offer letter 2026", expiresOn: "2026-11-01" })).ok).toBe(true);
    expect((await docs.remove(designer(), { documentId: id })).ok).toBe(false);
    expect((await docs.remove(hr(), { documentId: id })).ok).toBe(true);
    const [row] = await db.select().from(s.personDocuments);
    expect(row!.deletedAt).not.toBeNull();
    const [file] = await db.select({ deletedAt: s.storedFiles.deletedAt, size: s.storedFiles.sizeBytes }).from(s.storedFiles);
    expect(file!.deletedAt).not.toBeNull();
    const link = new URLSearchParams({ exp: String(Date.now() + 60_000), name: "x.pdf", viewer: ids.hr });
    expect((await files.read(hr().personId, row!.fileId, link)).ok).toBe(false);
    expect((await docs.open(hr(), { documentId: id })).ok).toBe(false);
    expect((await eventsFor(db, id)).map((e) => e.action)).toEqual(["document.uploaded", "document.updated", "document.removed"]);
  });
});
