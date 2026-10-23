// Meetings (Stage 13.4): due dates from words (English, Malayalam, Manglish), action items, decisions, carry-over.
import { describe, expect, it } from "vitest";
import { dayOfWeek } from "@/lib/dates";
import { actionItemsOf, carriedItems, decisionsOf, dueFrom, nextDate, taskTitle } from "@/services/rules/meetings";
import { meetingBody } from "@/services/rules/doc-templates";

const today = "2026-10-21"; // a Wednesday
const noSundays = (d: string) => dayOfWeek(d) !== 0;
const anu = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e8";

describe("due dates", () => {
  it("reads English words and dates", () => {
    expect(dueFrom("send it by Friday", today)).toBe("2026-10-23");
    expect(dueFrom("by Wednesday", today)).toBe("2026-10-28"); // the next one, not today
    expect(dueFrom("tomorrow", today)).toBe("2026-10-22");
    expect(dueFrom("day after tomorrow", today)).toBe("2026-10-23");
    expect(dueFrom("in 3 days", today)).toBe("2026-10-24");
    expect(dueFrom("in 2 weeks", today)).toBe("2026-11-04");
    expect(dueFrom("by 28 Oct", today)).toBe("2026-10-28");
    expect(dueFrom("Nov 3rd", today)).toBe("2026-11-03");
    expect(dueFrom("by 5 Jan", today)).toBe("2027-01-05"); // passed this year → next year's
    expect(dueFrom("on 30/10", today)).toBe("2026-10-30");
    expect(dueFrom("2026-12-01", today)).toBe("2026-12-01");
    expect(dueFrom("end of month", today)).toBe("2026-10-31");
    expect(dueFrom("next week", today)).toBe("2026-10-26");
    expect(dueFrom("call the principal", today)).toBeNull();
    expect(dueFrom("31/02", today)).toBeNull();
  });
  it("reads Malayalam and Manglish", () => {
    expect(dueFrom("naale ayakkanam", today)).toBe("2026-10-22");
    expect(dueFrom("നാളെ അയക്കണം", today)).toBe("2026-10-22");
    expect(dueFrom("mattannaal", today)).toBe("2026-10-23");
    expect(dueFrom("velli munpu", today)).toBe("2026-10-23");
    expect(dueFrom("വെള്ളിയാഴ്ച", today)).toBe("2026-10-23");
    expect(dueFrom("innu thanne", today)).toBe(today);
  });
  it("moves a day off to the next working day", () => {
    expect(dueFrom("by Sunday", today, noSundays)).toBe("2026-10-26");
    expect(dueFrom("25 Oct", today, noSundays)).toBe("2026-10-26");
  });
});

describe("meeting pages", () => {
  const page = [
    "## Attendees\n\n- Anu",
    "## Decisions\n\n- Budget stays at ₹50,000\n- Launch on 1 Nov",
    "## Action items",
    `- [ ] @[Anu Thomas](person:${anu}) send the media plan by Friday\n- [x] Book the hall naale\n- [ ] Ask about the brochure`,
    "## Next",
    "- not an action",
  ].join("\n\n");

  it("decisions are the items under Decisions", () => {
    expect(decisionsOf(page)).toEqual(["Budget stays at ₹50,000", "Launch on 1 Nov"]);
    expect(decisionsOf(meetingBody())).toEqual([]);
  });

  it("action items carry owner, due date and done", () => {
    const items = actionItemsOf(page, today);
    expect(items.map((a) => [a.ownerId, a.due, a.done])).toEqual([
      [anu, "2026-10-23", false],
      [null, "2026-10-22", true],
      [null, null, false],
    ]);
    expect(taskTitle(items[0]!.text, items[0]!.ownerName)).toBe("send the media plan");
    expect(actionItemsOf(meetingBody(), today)).toEqual([]); // the template's hint isn't an item
  });

  it("open items move to the next meeting with their mentions", () => {
    const carried = carriedItems(page, today);
    expect(carried).toEqual([`- [ ] @[Anu Thomas](person:${anu}) send the media plan by Friday`, "- [ ] Ask about the brochure"]);
    expect(actionItemsOf(meetingBody({ carried }), today).map((a) => a.ownerId)).toEqual([anu, null]);
    expect(nextDate("2026-10-21", "weekly")).toBe("2026-10-28");
    expect(nextDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });
});
