// @mentions in task comments (Stage 9b.2). Pure, unit-tested. The comment box inserts "@Full Name"; a first name alone
// works too when only one person on the team has it.

export type Mentionable = { id: string; fullName: string };

const isNameChar = (c: string | undefined) => Boolean(c && /[\p{L}\p{N}_]/u.test(c));

/** The people a comment mentions, in the order they first appear, each once. */
export function findMentions(body: string, people: readonly Mentionable[]): string[] {
  const text = body.toLowerCase();
  const firstNames = new Map<string, string[]>();
  for (const p of people) {
    const first = p.fullName.trim().split(/\s+/)[0]?.toLowerCase();
    if (first) firstNames.set(first, [...(firstNames.get(first) ?? []), p.id]);
  }
  // Longest names first, so "@Anjali Nair" isn't read as "@Anjali" when there is also an "Anjali Menon".
  const candidates = [
    ...people.map((p) => ({ id: p.id, name: p.fullName.trim().toLowerCase().replace(/\s+/g, " ") })),
    ...[...firstNames].filter(([, ids]) => ids.length === 1).map(([name, ids]) => ({ id: ids[0]!, name })),
  ]
    .filter((c) => c.name)
    .sort((a, b) => b.name.length - a.name.length);

  const found: Array<{ at: number; id: string }> = [];
  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", at + 1)) {
    if (isNameChar(text[at - 1])) continue; // an email address, not a mention
    const rest = text.slice(at + 1).replace(/\s+/g, " ");
    const hit = candidates.find((c) => rest.startsWith(c.name) && !isNameChar(rest[c.name.length]));
    if (hit) found.push({ at, id: hit.id });
  }
  return [...new Set(found.map((f) => f.id))];
}
