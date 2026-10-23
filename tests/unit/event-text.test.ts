import { describe, expect, it } from "vitest";
import { eventText } from "@/lib/event-text";

describe("client history lines (QA S4-B4)", () => {
  it("are sentences with proper status labels, never raw event names", () => {
    expect(eventText({ action: "task.status_changed", data: { title: "TEST Reel", to: "in_review" } })).toBe("moved “TEST Reel” to In review");
    expect(eventText({ action: "asset.send_to_client", data: {} })).toBe("sent a creative to the client");
    expect(eventText({ action: "asset.client_approved", data: {} })).toBe("recorded the client's approval of a creative");
    expect(eventText({ action: "content.created", data: { title: "TEST Diwali post" } })).toBe("planned the post “TEST Diwali post”");
    expect(eventText({ action: "automation.ran", data: {} })).toBe("an automation changed a task");
    expect(eventText({ action: "request_form.submitted", data: { from: "Principal" } })).toBe("sent a request (from Principal)");
    expect(eventText({ action: "something.new_and_unknown", data: {} })).toBe("made a change");
  });

  it("words the 13.x–14.x events", () => {
    expect(eventText({ action: "goal.checked_in", data: { title: "60 new colleges" } })).toBe("checked in on “60 new colleges”");
    expect(eventText({ action: "space_kit.applied", data: { kit: "marketing" } })).toBe("set up the space with the marketing kit");
    expect(eventText({ action: "doc_table.cell_changed", data: { title: "Plan" } })).toBe("changed a table (“Plan”)");
    expect(eventText({ action: "board.voting_started", data: { title: "Ideas" } })).toBe("worked on the board “Ideas”");
  });
});
