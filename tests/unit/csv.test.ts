import { describe, expect, it } from "vitest";
import { csvRecords, parseCsv } from "@/lib/csv";

describe("CSV", () => {
  it("reads plain and quoted fields", () => {
    expect(parseCsv('a,b,c\n1,"two, too","say ""hi"""\n')).toEqual([
      ["a", "b", "c"],
      ["1", "two, too", 'say "hi"'],
    ]);
  });

  it("keeps line breaks inside quotes, handles CRLF, a BOM and blank lines", () => {
    expect(parseCsv('﻿name,notes\r\n"Brief","line one\r\nline two"\r\n\r\nlast,\r\n')).toEqual([
      ["name", "notes"],
      ["Brief", "line one\r\nline two"],
      ["last", ""],
    ]);
  });

  it("maps rows to the header, filling missing cells", () => {
    expect(csvRecords("Task Name, Status \nBrief\n").records).toEqual([{ "Task Name": "Brief", Status: "" }]);
  });
});
