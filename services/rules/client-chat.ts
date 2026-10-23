// Client chat (Stage 12.6): what a client may follow in a message, and the warning staff see before something
// internal reaches the client. Pure: no I/O, unit-tested.
//
// D-12.6b links: in the client's view a link into Oppllo One becomes a portal link only when the portal can open it (a
// creative waiting for them, a final report, one of their requests); every other link into Oppllo One shows as
// "internal link" with no address. Links to other sites stay as they are.
// D-12.6c warning, never blocking: hours, fees, rupee amounts, budgets, invoices or another client's name in a staff
// message for the shared chat ask "Send to the client?" first.

export type PortalPart = { kind: "text"; text: string } | { kind: "link"; href: string; text: string } | { kind: "portal"; href: string; label: string } | { kind: "internal" };

const LINK = /(https?:\/\/[^\s<>]*[^\s<>.,;:!?)\]'"])|(?<![\w/])(\/(?:creatives|tasks|clients|projects|docs|chat|sales|people)\/[^\s<>]*[^\s<>.,;:!?)\]'"])/gi;
const ID = "[0-9a-f-]{36}";

export type PortalAllowed = { creativeIds: ReadonlySet<string>; reportMonths: ReadonlySet<string>; requestIds: ReadonlySet<string>; clientId: string };

/** Where an Oppllo One path leads in the portal, if anywhere. */
export function portalHref(path: string, search: string, allowed: PortalAllowed): { href: string; label: string } | null {
  let m = new RegExp(`^/creatives/(${ID})$`, "i").exec(path);
  if (m && allowed.creativeIds.has(m[1]!.toLowerCase())) return { href: "/portal/creatives", label: "Creative to review" };
  m = new RegExp(`^/clients/(${ID})/report$`, "i").exec(path);
  const month = new URLSearchParams(search).get("month")?.slice(0, 7);
  if (m && m[1]!.toLowerCase() === allowed.clientId && month && allowed.reportMonths.has(month)) return { href: `/portal/reports/${month}`, label: "Monthly report" };
  m = new RegExp(`^/tasks/(${ID})$`, "i").exec(path);
  if (m && allowed.requestIds.has(m[1]!.toLowerCase())) return { href: "/portal/requests", label: "Your request" };
  return null;
}

/** A message as the client sees it: their portal links work, other Oppllo One links are hidden. */
export function portalParts(body: string, appOrigin: string, allowed: PortalAllowed): PortalPart[] {
  const parts: PortalPart[] = [];
  let last = 0;
  for (const m of body.matchAll(LINK)) {
    if (m.index > last) parts.push({ kind: "text", text: body.slice(last, m.index) });
    last = m.index + m[0].length;
    let path: string | null = null;
    let search = "";
    if (m[1]) {
      try {
        const u = new URL(m[1]);
        if (u.origin === appOrigin) [path, search] = [u.pathname, u.search];
      } catch {
        // Not a real address: shown as written.
      }
    } else {
      const u = new URL(m[2]!, "https://x.invalid");
      [path, search] = [u.pathname, u.search];
    }
    if (path === null) {
      parts.push({ kind: "link", href: m[1]!, text: m[1]! });
      continue;
    }
    const to = portalHref(path, search, allowed);
    parts.push(to ? { kind: "portal", ...to } : { kind: "internal" });
  }
  if (last < body.length) parts.push({ kind: "text", text: body.slice(last) });
  return parts;
}

/** Why a staff message might not be for the client's eyes (empty when nothing stands out). */
export function clientWarnings(text: string, otherClients: readonly string[]): string[] {
  const out: string[] = [];
  if (/\b\d+(\.\d+)?\s*(h|hr|hrs|hours?|mins?|minutes)\b|\bhours?\b|\bburn\b|\btimesheet/i.test(text)) out.push("hours");
  if (/₹|\brs\.?\s*\d|\binr\b|\brupees?\b|\bfees?\b|\bretainer\b|\binvoice|\bbudget\b|\bmargin\b|\bpaise\b|\d+\s*(k|l|lakh|lakhs|cr|crore)\b/i.test(text)) out.push("fees or money");
  const lower = text.toLowerCase();
  const named = otherClients.filter((n) => n.trim().length >= 3 && lower.includes(n.toLowerCase()));
  if (named.length) out.push(`another client (${named.slice(0, 3).join(", ")})`);
  return out;
}
