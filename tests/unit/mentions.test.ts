import { describe, expect, it } from "vitest";
import { findMentions } from "@/services/rules/mentions";

const people = [
  { id: "anjali", fullName: "Anjali Nair" },
  { id: "anjali-m", fullName: "Anjali Menon" },
  { id: "vishnu", fullName: "Vishnu Prasad" },
  { id: "hiba", fullName: "Hiba  Nasrin" },
];

describe("findMentions", () => {
  it("finds full names in any case, each once, in order", () => {
    expect(findMentions("@vishnu prasad can you check? cc @Anjali Nair and again @Vishnu Prasad", people)).toEqual(["vishnu", "anjali"]);
  });

  it("takes a first name alone only when one person has it", () => {
    expect(findMentions("@Vishnu please, and @Anjali", people)).toEqual(["vishnu"]);
    expect(findMentions("@Hiba thanks", people)).toEqual(["hiba"]);
  });

  it("prefers the longest name and needs the name to end there", () => {
    expect(findMentions("@Anjali Menon, over to you", people)).toEqual(["anjali-m"]);
    expect(findMentions("@Vishnuprasad", people)).toEqual([]);
  });

  it("ignores email addresses and a bare @", () => {
    expect(findMentions("mail vishnu@vishnu prasad.com or @ someone", people)).toEqual([]);
  });

  it("copes with line breaks and extra spaces inside a name", () => {
    expect(findMentions("Done.\n@Hiba Nasrin\nplease post", people)).toEqual(["hiba"]);
    expect(findMentions("@Anjali\nNair", people)).toEqual(["anjali"]);
  });
});
