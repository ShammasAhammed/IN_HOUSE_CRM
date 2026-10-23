// "Share to Oppllo" (Stage 13.2): the share-target route needs a signed-in person, refuses other sites, and hands only
// checked fields to the swipe service.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ actor: null as null | { personId: string }, calls: [] as unknown[] }));
vi.mock("@/lib/server/session", () => ({ getActor: async () => state.actor }));
vi.mock("@/lib/server/container", () => ({
  getServices: () => ({
    swipe: {
      receiveShare: async (actor: unknown, raw: { url: string; text: string }, file: unknown) => {
        state.calls.push({ actor, raw, file });
        return raw.url.startsWith("javascript:") ? { ok: false, error: { code: "invalid", message: "That shared link isn't a web address." } } : { ok: true, value: { id: "share-1" } };
      },
    },
  }),
}));
const { POST } = await import("@/app/api/share/route");

const post = (fields: Record<string, string>, headers: Record<string, string> = {}) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return POST(new Request("https://one.oppllo.com/api/share", { method: "POST", body, headers }));
};

beforeEach(() => {
  state.actor = null;
  state.calls = [];
});

describe("POST /api/share", () => {
  it("sends people who aren't signed in to sign in, and keeps nothing", async () => {
    const r = await post({ url: "https://youtu.be/dQw4w9WgXcQ" });
    expect([r.status, r.headers.get("location")]).toEqual([303, "https://one.oppllo.com/sign-in?next=%2Fshare"]);
    expect(state.calls).toEqual([]);
  });
  it("refuses a post from another site", async () => {
    state.actor = { personId: "p1" };
    expect((await post({ url: "https://a.example" }, { origin: "https://evil.example" })).status).toBe(403);
    expect(state.calls).toEqual([]);
  });
  it("hands the shared fields to the swipe service and opens the picker", async () => {
    state.actor = { personId: "p1" };
    const r = await post({ title: "Look", text: "Nice reel https://youtu.be/dQw4w9WgXcQ", url: "", extra: "ignored" });
    expect(r.headers.get("location")).toBe("https://one.oppllo.com/share?id=share-1");
    expect(state.calls).toEqual([{ actor: { personId: "p1" }, raw: { url: "", title: "Look", text: "Nice reel https://youtu.be/dQw4w9WgXcQ" }, file: null }]);
    const bad = await post({ url: "javascript:alert(1)" });
    expect(new URL(bad.headers.get("location")!).searchParams.get("error")).toBe("That shared link isn't a web address.");
  });
});
