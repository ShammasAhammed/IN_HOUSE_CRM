// References and live cards on boards (Stage 13.2). Pure, unit-tested.
//   - What a pasted link is (YouTube, Instagram, Facebook, anything else).
//   - Which addresses Oppllo One may fetch a preview from: https on port 443, public hosts only. The fetching adapter
//     also checks every address the name resolves to and connects to that checked address (no DNS rebinding).
//   - Reading a page's preview (title, description, picture) from its HTML.
//   - Live card links on the canvas: `https://cards.oppllo.invalid/<kind>/<id>` (a reserved name that never resolves),
//     drawn by Oppllo One from its own /board-cards pages, so a scene never holds a deployment's address.
import { BOARD_CARD_KINDS, type BoardCardKind, type SwipeKind } from "@/lib/types";

export const MAX_PAGE_BYTES = 512_000;
export const FETCH_TIMEOUT_MS = 5000;
export const MAX_REDIRECTS = 3;
export const PREVIEW_CACHE_HOURS = 24;
export const MAX_SWIPE_IMAGE_BYTES = 3_500_000;
/** Through Oppllo One's server a request stops at 4.5 MB (Vercel), so even with Drive a video stays small for now. */
export const MAX_SWIPE_VIDEO_BYTES = 4_000_000;
export const SWIPE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const SWIPE_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

// ---------- addresses ----------

function v4(ip: string): number[] | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const n = p.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  return n.every((x) => x >= 0 && x <= 255) ? n : null;
}

/** IPv6 as eight 16-bit groups (handles "::" and a trailing IPv4 part). */
function v6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  if (!s.includes(":")) return null;
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const maybe4 = v4(s.slice(lastColon + 1));
  if (maybe4) {
    tail = [(maybe4[0]! << 8) | maybe4[1]!, (maybe4[2]! << 8) | maybe4[3]!];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const part = (h: string) => (h ? h.split(":").map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16) : NaN)) : []);
  const head = part(halves[0]!);
  const rest = halves.length === 2 ? part(halves[1]!) : [];
  if ([...head, ...rest].some((x) => Number.isNaN(x))) return null;
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...Array(Math.max(0, fill)).fill(0), ...rest];
  if (groups.length !== 8) return null;
  if (tail.length) groups.splice(6, 2, ...tail);
  return groups;
}

function publicV4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a! >= 224) return false; // this network, private, loopback, multicast/reserved
  if (a === 100 && b! >= 64 && b! <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata (169.254.169.254)
  if (a === 172 && b! >= 16 && b! <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF, documentation
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/** True only for a public internet address (IPv4 or IPv6). Anything unreadable counts as not public. */
export function isPublicIp(ip: string): boolean {
  const a = v4(ip);
  if (a) return publicV4(a);
  const g = v6(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the IPv4 inside.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return publicV4([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]);
  if (g[0] === 0x64 && g[1] === 0xff9b) return publicV4([g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255]); // NAT64
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0]! & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0]! & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2002) return false; // 6to4 (may wrap a private IPv4)
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  return true;
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** A link Oppllo One may fetch: https, the standard port, no user name or password, a real public host name or IP. */
export function checkPublicUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That isn't a web address." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "Only https links can be previewed." };
  if (u.username || u.password) return { ok: false, reason: "Links with a user name or password can't be previewed." };
  if (u.port && u.port !== "443") return { ok: false, reason: "Only links on the standard https port can be previewed." };
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".invalid")) return { ok: false, reason: "That address isn't on the public internet." };
  const literal = host.replace(/^\[|\]$/g, "");
  if ((v4(literal) || v6(literal)) && !isPublicIp(literal)) return { ok: false, reason: "That address isn't on the public internet." };
  if (!literal.includes(".") && !v6(literal)) return { ok: false, reason: "That address isn't on the public internet." };
  return { ok: true, url: u };
}

// ---------- what a link is ----------

export type LinkKind = { kind: Extract<SwipeKind, "youtube">; videoId: string } | { kind: Extract<SwipeKind, "instagram" | "facebook" | "link"> };

export function classifyLink(u: URL): LinkKind {
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) return { kind: "youtube", videoId: id };
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const id = u.searchParams.get("v") ?? /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] ?? "";
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) return { kind: "youtube", videoId: id };
  }
  if (host === "instagram.com" || host === "instagr.am") return { kind: "instagram" };
  if (host === "facebook.com" || host === "fb.watch" || host === "fb.com") return { kind: "facebook" };
  return { kind: "link" };
}

/** YouTube without cookies until the person presses play. */
export const youtubeEmbed = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}`;

// ---------- a page's preview ----------

export type Preview = { title: string | null; description: string | null; image: string | null; site: string | null };

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Title, description, picture and site name from a page's <head> (Open Graph, Twitter cards, then plain tags). */
export function parsePreview(html: string, pageUrl: string): Preview {
  const head = html.slice(0, 200_000);
  const meta = new Map<string, string>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    if (key && content && !meta.has(key)) meta.set(key, decode(content[1] ?? content[2] ?? ""));
  }
  const title = meta.get("og:title") || meta.get("twitter:title") || (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)![1]!) : null);
  const description = meta.get("og:description") || meta.get("twitter:description") || meta.get("description") || null;
  let image: string | null = meta.get("og:image") || meta.get("og:image:secure_url") || meta.get("twitter:image") || null;
  if (image) {
    try {
      const u = new URL(image, pageUrl);
      // Shown straight from its site, so only https pictures on public hosts.
      image = checkPublicUrl(u.toString()).ok ? u.toString() : null;
    } catch {
      image = null;
    }
  }
  const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
  return { title: clip(title, 300), description: clip(description, 1000), image: clip(image, 2000), site: clip(meta.get("og:site_name") ?? new URL(pageUrl).hostname.replace(/^www\./, ""), 100) };
}

// ---------- live cards on the canvas ----------

export const CARD_HOST = "cards.oppllo.invalid";
export const cardUrl = (kind: BoardCardKind, id: string) => `https://${CARD_HOST}/${kind}/${id}`;
export function parseCardUrl(link: string | null | undefined): { kind: BoardCardKind; id: string } | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    if (u.protocol !== "https:" || u.hostname !== CARD_HOST) return null;
    const [, kind, id] = u.pathname.split("/");
    if (!kind || !id || !(BOARD_CARD_KINDS as readonly string[]).includes(kind) || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { kind: kind as BoardCardKind, id };
  } catch {
    return null;
  }
}
