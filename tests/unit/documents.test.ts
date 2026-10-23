import { describe, expect, it } from "vitest";
import { documentExpiry, safeFileName, sniffDocumentType } from "@/services/rules/documents";

const bytes = (...parts: Array<string | number[]>) => new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("sniffDocumentType", () => {
  it("reads the real type from the first bytes", () => {
    expect(sniffDocumentType(bytes("%PDF-1.7\n"))?.extension).toBe("pdf");
    expect(sniffDocumentType(bytes([0xff, 0xd8, 0xff, 0xe0])))?.toMatchObject({ contentType: "image/jpeg" });
    expect(sniffDocumentType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])))?.toMatchObject({ extension: "png" });
    expect(sniffDocumentType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ")))?.toMatchObject({ extension: "webp" });
    expect(sniffDocumentType(bytes([0x50, 0x4b, 0x03, 0x04], "....[Content_Types].xml....word/document.xml")))?.toMatchObject({ extension: "docx" });
  });

  it("refuses everything else, whatever the name says", () => {
    expect(sniffDocumentType(bytes("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffDocumentType(bytes("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffDocumentType(bytes([0x50, 0x4b, 0x03, 0x04], "....xl/workbook.xml"))).toBeNull();
    expect(sniffDocumentType(new Uint8Array())).toBeNull();
  });
});

describe("safeFileName", () => {
  const pdf = sniffDocumentType(bytes("%PDF-"))!;
  it("drops folders and odd characters and uses the real extension", () => {
    expect(safeFileName("C:\\Users\\vishnu\\Offer Letter.PDF", pdf)).toBe("Offer Letter.pdf");
    expect(safeFileName('../../etc/"pass"wd.exe', pdf)).toBe("passwd.pdf");
    expect(safeFileName("", pdf)).toBe("document.pdf");
    expect(safeFileName("നിയമന കത്ത്.pdf", pdf)).toBe("നിയമന കത്ത്.pdf");
  });
});

describe("documentExpiry", () => {
  it("is expired after the day, soon within 30 days", () => {
    expect(documentExpiry(null, "2026-10-14")).toBeNull();
    expect(documentExpiry("2026-10-13", "2026-10-14")).toBe("expired");
    expect(documentExpiry("2026-10-14", "2026-10-14")).toBe("soon");
    expect(documentExpiry("2026-11-13", "2026-10-14")).toBe("soon");
    expect(documentExpiry("2026-11-14", "2026-10-14")).toBeNull();
  });
});
