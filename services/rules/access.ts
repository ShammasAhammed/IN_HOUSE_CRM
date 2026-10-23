// Access to spaces (Stage 14.2): what each level means in plain words, the preview shown before asking, the message
// the member reads before "I understand", and who may approve. Pure: no I/O, unit-tested.
//
// D-14.2a levels (enforced in services/spaces.ts levelAllows on every change inside a space):
//   view    — sees the space's projects, tasks, docs and files; changes nothing.
//   comment — view, plus comment and @mention on tasks and watch them.
//   edit    — comment, plus the work: create and change tasks, log time, add files and creatives, write docs, as far
//             as their role allows anywhere else.
//   manage  — edit, plus ask for others' access to this space and rename or archive it. Never approving access, and
//             never making a space private or sensitive (the owner's alone).
// D-14.2b approvals: the owner or HR asks, and a different person approves. For a sensitive space (every private space,
//   plus any marked sensitive) the two must be one owner and one HR. With no HR person at all, the owner approves
//   alone, even their own request, and the request and its event say "owner alone".
import { formatDate } from "@/lib/format";
import type { IsoDate } from "@/lib/dates";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/types";

export const LEVEL_RANK: Record<AccessLevel, number> = { view: 0, comment: 1, edit: 2, manage: 3 };
export const atLeast = (level: AccessLevel, need: AccessLevel) => LEVEL_RANK[level] >= LEVEL_RANK[need];

const CAN: Record<AccessLevel, string> = {
  view: "see the space's projects, tasks, docs and files",
  comment: "comment on tasks, mention people and watch tasks",
  edit: "create and change tasks, log time, add files and creatives, and write docs, as far as their role allows",
  manage: "ask for other people's access to this space, and rename or archive it",
};

/** What a level allows and doesn't, as lists of plain phrases. */
export function levelWords(level: AccessLevel): { can: string[]; cannot: string[] } {
  const rank = LEVEL_RANK[level];
  const can = ACCESS_LEVELS.filter((l) => LEVEL_RANK[l] <= rank).map((l) => CAN[l]);
  const cannot = ACCESS_LEVELS.filter((l) => LEVEL_RANK[l] > rank).map((l) => CAN[l]);
  cannot.push("approve anyone's access", "make the space private or sensitive (the owner's choice)");
  return { can, cannot };
}

const until = (expiresOn: IsoDate | null) => (expiresOn ? `until ${formatDate(expiresOn)}` : "with no end date");

/** "Anu will be able to …; will not be able to …", shown before the request is sent and again to the approver. */
export function accessPreview(r: { personName: string; spaceName: string; level: AccessLevel; expiresOn: IsoDate | null; isPrivate: boolean }): string {
  const w = levelWords(r.level);
  return [
    `${r.personName} will be able to ${w.can.join("; ")} in ${r.spaceName}, ${until(r.expiresOn)}.`,
    `${r.personName} will not be able to ${w.cannot.join("; ")}.`,
    r.isPrivate ? `${r.spaceName} is private: only its members and the owner see it.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The member's message: what they get, what they don't, who asked and approved, until when. */
export function memberMessage(r: { spaceName: string; level: AccessLevel; expiresOn: IsoDate | null; requestedByName: string; decidedByName: string; ownerAlone: boolean; reason: string; isPrivate: boolean }): string {
  const w = levelWords(r.level);
  return [
    `You can now ${w.can.join("; ")} in ${r.spaceName}, ${until(r.expiresOn)}.`,
    `You cannot ${w.cannot.join("; ")}.`,
    r.isPrivate ? `${r.spaceName} is private: keep what you see there inside it.` : null,
    `Asked by ${r.requestedByName}${r.ownerAlone ? `, approved by ${r.decidedByName} alone (there is no HR person)` : `, approved by ${r.decidedByName}`}. Why: ${r.reason.trim().replace(/([^.!?])$/, "$1.")}`,
    "Access opens when you press \"I understand\" on My access.",
  ]
    .filter(Boolean)
    .join(" ");
}

type Person = { id: string; isOwner: boolean; isHr: boolean };

/** May `approver` approve or refuse `requester`'s request? With the rule's reason when not. */
export function mayDecide(input: { requester: Person; approver: Person; sensitive: boolean; hrExists: boolean }): { ok: true; ownerAlone: boolean } | { ok: false; message: string } {
  const { requester, approver, sensitive, hrExists } = input;
  if (!approver.isOwner && !approver.isHr) return { ok: false, message: "Only the owner or HR approves access." };
  // D-14.2b: no HR person at all, so the owner is the only one who can decide, and it's said so.
  if (!hrExists && approver.isOwner) return { ok: true, ownerAlone: approver.id === requester.id || sensitive };
  if (approver.id === requester.id) return { ok: false, message: "Nobody approves their own request: the other of the owner and HR does." };
  if (sensitive && !((requester.isOwner && approver.isHr) || (requester.isHr && approver.isOwner))) {
    return { ok: false, message: "This space is sensitive: the owner and HR both take part, one asking and the other approving." };
  }
  return { ok: true, ownerAlone: false };
}
