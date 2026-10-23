// Access to spaces (Stage 14.2): who may approve (D-14.2b), and what each level means (D-14.2a).
import { describe, expect, it } from "vitest";
import { accessPreview, atLeast, levelWords, mayDecide } from "@/services/rules/access";

const owner = { id: "o", isOwner: true, isHr: false };
const owner2 = { id: "o2", isOwner: true, isHr: false };
const hr = { id: "h", isOwner: false, isHr: true };
const hr2 = { id: "h2", isOwner: false, isHr: true };
const staff = { id: "s", isOwner: false, isHr: false };

describe("mayDecide", () => {
  it("needs a different person of owner/HR, never yourself", () => {
    expect(mayDecide({ requester: hr, approver: hr2, sensitive: false, hrExists: true })).toEqual({ ok: true, ownerAlone: false });
    expect(mayDecide({ requester: hr, approver: owner, sensitive: false, hrExists: true })).toEqual({ ok: true, ownerAlone: false });
    expect(mayDecide({ requester: hr, approver: hr, sensitive: false, hrExists: true }).ok).toBe(false);
    expect(mayDecide({ requester: owner, approver: owner, sensitive: false, hrExists: true }).ok).toBe(false);
    expect(mayDecide({ requester: hr, approver: staff, sensitive: false, hrExists: true }).ok).toBe(false);
  });

  it("needs one owner and one HR for sensitive spaces", () => {
    expect(mayDecide({ requester: hr, approver: owner, sensitive: true, hrExists: true }).ok).toBe(true);
    expect(mayDecide({ requester: owner, approver: hr, sensitive: true, hrExists: true }).ok).toBe(true);
    expect(mayDecide({ requester: hr, approver: hr2, sensitive: true, hrExists: true }).ok).toBe(false);
    expect(mayDecide({ requester: owner, approver: owner2, sensitive: true, hrExists: true }).ok).toBe(false);
  });

  it("lets the owner decide alone when there's no HR person, and marks it", () => {
    expect(mayDecide({ requester: owner, approver: owner, sensitive: false, hrExists: false })).toEqual({ ok: true, ownerAlone: true });
    expect(mayDecide({ requester: owner, approver: owner2, sensitive: true, hrExists: false })).toEqual({ ok: true, ownerAlone: true });
    expect(mayDecide({ requester: owner, approver: owner2, sensitive: false, hrExists: false })).toEqual({ ok: true, ownerAlone: false });
  });
});

describe("levels", () => {
  it("each level includes the ones below and never approval or privacy", () => {
    expect(atLeast("manage", "edit")).toBe(true);
    expect(atLeast("comment", "edit")).toBe(false);
    expect(levelWords("view").can).toHaveLength(1);
    expect(levelWords("manage").can).toHaveLength(4);
    expect(levelWords("manage").cannot).toEqual(["approve anyone's access", "make the space private or sensitive (the owner's choice)"]);
  });

  it("previews in plain words", () => {
    expect(accessPreview({ personName: "Anu", spaceName: "Sales", level: "view", expiresOn: null, isPrivate: false })).toBe(
      "Anu will be able to see the space's projects, tasks, docs and files in Sales, with no end date. Anu will not be able to comment on tasks, mention people and watch tasks; create and change tasks, log time, add files and creatives, and write docs, as far as their role allows; ask for other people's access to this space, and rename or archive it; approve anyone's access; make the space private or sensitive (the owner's choice).",
    );
  });
});
