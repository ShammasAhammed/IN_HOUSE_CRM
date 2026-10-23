import { describe, expect, it } from "vitest";
import { formatTimecode, parseTimecode } from "@/lib/format";
import { availableActions, nextState, stateAfterNewVersion } from "@/services/rules/assets";

describe("creative approval (D80)", () => {
  it("goes draft → internal review → client → approved", () => {
    expect(nextState("draft", "submit", false)).toBe("internal_review");
    expect(nextState("internal_review", "send_to_client", false)).toBe("client_review");
    expect(nextState("client_review", "client_approved", false)).toBe("approved");
    expect(nextState("client_review", "client_changes", false)).toBe("changes_requested");
    expect(nextState("changes_requested", "submit", false)).toBe("internal_review");
  });

  it("skips the client for Oppllo's own work, and never skips it for a client", () => {
    expect(nextState("internal_review", "approve", true)).toBe("approved");
    expect(nextState("internal_review", "approve", false)).toBeNull();
    expect(nextState("internal_review", "send_to_client", true)).toBeNull();
  });

  it("refuses steps from the wrong state", () => {
    expect(nextState("approved", "submit", false)).toBeNull();
    expect(nextState("draft", "client_approved", false)).toBeNull();
    expect(nextState("client_review", "request_changes", false)).toBeNull();
  });

  it("offers makers and reviewers only their own steps", () => {
    const base = { internalClient: false, hasVersion: true };
    expect(availableActions({ ...base, state: "draft", canMake: true, canReview: false })).toEqual(["submit"]);
    expect(availableActions({ ...base, state: "draft", canMake: false, canReview: true })).toEqual([]);
    expect(availableActions({ ...base, state: "internal_review", canMake: true, canReview: true })).toEqual(["send_to_client", "request_changes"]);
    expect(availableActions({ ...base, internalClient: true, state: "internal_review", canMake: false, canReview: true })).toEqual(["approve", "request_changes"]);
    expect(availableActions({ ...base, state: "client_review", canMake: false, canReview: true })).toEqual(["client_approved", "client_changes"]);
    expect(availableActions({ ...base, hasVersion: false, state: "draft", canMake: true, canReview: true })).toEqual([]);
  });

  it("starts the review again with a new version", () => {
    expect(stateAfterNewVersion(true)).toBe("internal_review");
    expect(stateAfterNewVersion(false)).toBe("draft");
  });

  it("reads and writes video moments", () => {
    expect(parseTimecode("1:05")).toBe(65);
    expect(parseTimecode("45")).toBe(45);
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode("1:75")).toBeNull();
    expect(parseTimecode("a")).toBeNull();
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(5)).toBe("0:05");
  });
});
