import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { signFileLink, verifyFileLink } = await import("@/lib/server/signed-links");

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-signed-links";
});

const params = (url: string) => new URL(url, "http://localhost").searchParams;
const id = "0199e3a0-0000-7000-8000-000000000001";
const viewer = "0199e3a0-0000-7000-8000-00000000000a";
const file = { provider: "postgres" as const, fileId: id };

describe("signed file links", () => {
  it("open the file they were made for, for the person they were made for, until they expire", () => {
    const now = new Date("2026-10-14T06:30:00Z");
    const url = signFileLink(file, new Date(now.getTime() + 5 * 60_000), "Offer letter.pdf", viewer);
    expect(url.startsWith(`/api/files/${id}?p=postgres&`)).toBe(true);
    expect(verifyFileLink(id, params(url), viewer, now)).toEqual({ ok: true, name: "Offer letter.pdf", provider: "postgres" });
    expect(verifyFileLink(id, params(url), viewer, new Date(now.getTime() + 6 * 60_000)).ok).toBe(false);
    expect(verifyFileLink(id, params(url), "0199e3a0-0000-7000-8000-00000000000b", now).ok).toBe(false);
  });

  it("stop working when anything in them is changed", () => {
    const now = new Date("2026-10-14T06:30:00Z");
    const url = signFileLink(file, new Date(now.getTime() + 5 * 60_000), "a.pdf", viewer);
    expect(verifyFileLink("0199e3a0-0000-7000-8000-000000000002", params(url), viewer, now).ok).toBe(false);
    for (const [key, value] of [["p", "google_drive"], ["exp", "9999999999"], ["name", "b.pdf"], ["sig", "x"]] as const) {
      const p = params(url);
      p.set(key, value);
      expect(verifyFileLink(id, p, viewer, now).ok).toBe(false);
    }
    expect(verifyFileLink(id, new URLSearchParams(), viewer, now).ok).toBe(false);
  });
});
