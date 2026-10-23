// Client knowledge base (Stage 11.2): pure helpers for reading and searching it. No I/O, unit-tested.

/** A do's or don'ts box as a list: one point per line, without the "-", "•" or "1." people type in front. */
export function points(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

const fold = (s: string) => s.normalize("NFC").toLocaleLowerCase("en-IN");

/** True when every word of the query appears somewhere in the texts (any order, any case, Malayalam too). */
export function matchesQuery(texts: ReadonlyArray<string | null>, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(texts.filter(Boolean).join("\n"));
  return words.every((w) => haystack.includes(w));
}
