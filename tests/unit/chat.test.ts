// Chat (Stage 12.1): editing window, titles, unread labels.
import { describe, expect, it } from "vitest";
import { channelTitle, mayEdit, messageParts, unreadLabel } from "@/services/rules/chat";

describe("chat rules", () => {
  const at = new Date("2026-10-21T10:00:00Z");
  it("lets people edit their own message for 15 minutes, never someone else's or a removed one", () => {
    expect(mayEdit({ authorId: "a", createdAt: at, deletedAt: null }, "a", new Date("2026-10-21T10:15:00Z"))).toBe(true);
    expect(mayEdit({ authorId: "a", createdAt: at, deletedAt: null }, "a", new Date("2026-10-21T10:15:01Z"))).toBe(false);
    expect(mayEdit({ authorId: "a", createdAt: at, deletedAt: null }, "b", at)).toBe(false);
    expect(mayEdit({ authorId: "a", createdAt: at, deletedAt: at }, "a", at)).toBe(false);
  });

  it("names channels for the person reading", () => {
    expect(channelTitle({ kind: "team", name: "Design", clientName: null, memberNames: [] }, "Anu")).toBe("Design");
    expect(channelTitle({ kind: "client", name: null, clientName: "Zenith", memberNames: [] }, "Anu")).toBe("Zenith");
    expect(channelTitle({ kind: "direct", name: null, clientName: null, memberNames: ["Anu", "Bina", "Chris"] }, "Anu")).toBe("Bina, Chris");
    expect(unreadLabel(5)).toBe("5");
    expect(unreadLabel(140)).toBe("99+");
  });

  it("turns links into Oppllo One into chips, other links into links, and highlights mentions", () => {
    const task = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
    expect(messageParts(`@Anu Das see https://one.oppllo.com/tasks/${task}, /docs/${task} and https://drive.google.com/x.`, "https://one.oppllo.com", ["Anu", "Anu Das"])).toEqual([
      { kind: "mention", text: "@Anu Das" },
      { kind: "text", text: " see " },
      { kind: "chip", href: `/tasks/${task}`, label: "Task" },
      { kind: "text", text: ", " },
      { kind: "chip", href: `/docs/${task}`, label: "Doc" },
      { kind: "text", text: " and " },
      { kind: "link", href: "https://drive.google.com/x", text: "https://drive.google.com/x" },
      { kind: "text", text: "." },
    ]);
    expect(messageParts(`https://evil.example/tasks/${task}`, "https://one.oppllo.com", [])).toEqual([{ kind: "link", href: `https://evil.example/tasks/${task}`, text: `https://evil.example/tasks/${task}` }]);
    expect(messageParts("plain", "https://one.oppllo.com", [])).toEqual([{ kind: "text", text: "plain" }]);
  });
});
