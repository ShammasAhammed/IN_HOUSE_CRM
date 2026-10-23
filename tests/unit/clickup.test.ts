import { describe, expect, it } from "vitest";
import { readAssignees, readClickUpCsv, readDate } from "@/lib/clickup";

const EXPORT = [
  "Task ID,Task Name,Task Content,Status,Due Date,Start Date,Parent ID,Assignees,Priority,Space Name,Folder Name,List Name,Time Estimated",
  // 1760380200000 = 13 Oct 2025 18:30 UTC = 14 Oct 2025 in India.
  'abc1,Design reels,"Brief: 3 reels\nUse new logo",in progress,1760380200000,,,"[Vishnu Prasad, Nikhil]",high,Clients,Zenith IAS,October,7200000',
  "abc2,Reel 1 cut,,to do,10/20/2025,,abc1,[],,Clients,Zenith IAS,October,",
  ",Monthly report,,complete,2025-10-31,,,Anjali,normal,Clients,Medcrest,Reports,",
  ",,,to do,,,,,,,,,",
  "abc4,Weird date,,to do,next week,,,,,Clients,Medcrest,Reports,",
].join("\n");

describe("reading a ClickUp export", () => {
  it("keeps what matters, in the shapes Oppllo One uses", () => {
    const r = readClickUpCsv(EXPORT);
    expect(r.skippedRows).toBe(1);
    expect(r.badDates).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.tasks[0]).toEqual({
      ref: "abc1",
      name: "Design reels",
      description: "Brief: 3 reels\nUse new logo",
      status: "in progress",
      dueDate: "2025-10-14",
      startDate: null,
      parentRef: null,
      assignees: ["Vishnu Prasad", "Nikhil"],
      priority: "high",
      space: "Clients",
      folder: "Zenith IAS",
      list: "October",
      estimateMinutes: 120,
    });
    expect(r.tasks[1]).toMatchObject({ parentRef: "abc1", dueDate: "2025-10-20", assignees: [] });
    // No id: the list and name stand in.
    expect(r.tasks[2]).toMatchObject({ ref: "Reports/Monthly report", dueDate: "2025-10-31", assignees: ["Anjali"] });
  });

  it("reads dates and assignee lists loosely", () => {
    expect(readDate("")).toBeNull();
    expect(readDate("2025-01-05T10:00:00Z")).toBe("2025-01-05");
    expect(readDate("1/5/2025")).toBe("2025-01-05");
    expect(readDate("Friday")).toBeNull();
    expect(readAssignees("[]")).toEqual([]);
    expect(readAssignees("Anjali Nair")).toEqual(["Anjali Nair"]);
  });

  it("reports columns it couldn't find", () => {
    expect(readClickUpCsv("Name,Status\nBrief,open\n").missing).toContain("ref");
  });
});
