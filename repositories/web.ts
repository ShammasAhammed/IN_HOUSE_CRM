// Reading the public web (Stage 13.2): link previews and official embeds (YouTube, Meta oEmbed). The adapter fetches
// only public https addresses (no private, loopback, link-local or cloud-metadata hosts, also after DNS and redirects),
// with size and time limits and no cookies.
export type WebRead<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface PublicWeb {
  /** A page's HTML (text/html only), following up to three redirects that are themselves public. */
  page(url: string): Promise<WebRead<{ url: string; html: string }>>;
  /** YouTube's public oEmbed (title and channel). */
  youtube(url: string): Promise<WebRead<{ title: string | null; author: string | null }>>;
  /** Meta's official oEmbed for an Instagram or Facebook post; not_configured without a token. */
  metaEmbed(url: string, kind: "instagram" | "facebook"): Promise<WebRead<{ html: string; title: string | null; author: string | null }>>;
}
