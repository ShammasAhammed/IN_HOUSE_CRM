// Fetching from the public web without reaching inside our own network (SSRF guard, Stage 13.2).
//   1. The address must pass checkPublicUrl: https, port 443, no user info, a public host.
//   2. The host name is resolved here; every address it resolves to must be public.
//   3. The connection goes to that checked address (the request's own lookup is replaced), so a second DNS answer
//      can't swap in a private one (DNS rebinding). TLS still checks the certificate for the host name.
//   4. Redirects are followed by hand, at most three, each one checked again from step 1.
//   5. Five seconds and 512 KB at most; no cookies are ever sent; only the expected content type is read.
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";
import type { PublicWeb, WebRead } from "@/repositories";
import { checkPublicUrl, FETCH_TIMEOUT_MS, isPublicIp, MAX_PAGE_BYTES, MAX_REDIRECTS } from "@/services/rules/references";

export type Resolve = (host: string) => Promise<Array<{ address: string; family: number }>>;
export type Request = (opts: RequestOptions, onResponse: (res: IncomingMessage) => void) => { on(event: "error", fn: (e: Error) => void): unknown; setTimeout(ms: number, fn: () => void): unknown; destroy(e?: Error): unknown; end(): unknown };

type Got = { status: number; location: string | null; contentType: string; body: string };

async function getOnce(url: URL, resolve: Resolve, request: Request, accept: string): Promise<WebRead<Got>> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await resolve(host);
  } catch {
    return { ok: false, reason: "That site's name doesn't resolve." };
  }
  if (!addresses.length || addresses.some((a) => !isPublicIp(a.address))) return { ok: false, reason: "That address isn't on the public internet." };
  const pinned = addresses[0]!;
  return new Promise((done) => {
    let settled = false;
    const finish = (r: WebRead<Got>) => {
      if (!settled) {
        settled = true;
        done(r);
      }
    };
    const req = request(
      {
        method: "GET",
        host,
        servername: host,
        port: 443,
        path: `${url.pathname}${url.search}`,
        headers: { "User-Agent": "OpplloOneBot/1.0 (link preview)", Accept: accept, "Accept-Language": "en" },
        // Connect to the address checked above, whatever DNS says now.
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => (opts?.all ? cb(null, [pinned]) : cb(null, pinned.address, pinned.family))) as unknown as RequestOptions["lookup"],
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return finish({ ok: true, value: { status, location: res.headers.location ?? null, contentType, body: "" } });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_PAGE_BYTES) {
            // Enough for a preview: keep what came (the <head> is at the top).
            chunks.push(c.subarray(0, Math.max(0, c.length - (size - MAX_PAGE_BYTES))));
            res.destroy();
            finish({ ok: true, value: { status, location: null, contentType, body: Buffer.concat(chunks).toString("utf8") } });
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => finish({ ok: true, value: { status, location: null, contentType, body: Buffer.concat(chunks).toString("utf8") } }));
        res.on("error", () => finish({ ok: false, reason: "The site stopped answering." }));
      },
    );
    req.setTimeout(FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error("timeout"));
      finish({ ok: false, reason: "The site took too long to answer." });
    });
    req.on("error", () => finish({ ok: false, reason: "The site couldn't be reached." }));
    req.end();
  });
}

/** GET a public https address, following public redirects only; `accept` decides the content type allowed. */
export async function fetchPublic(raw: string, kind: "html" | "json", deps: { resolve?: Resolve; request?: Request } = {}): Promise<WebRead<{ url: string; body: string }>> {
  const resolve = deps.resolve ?? (async (h: string) => dnsLookup(h, { all: true, verbatim: true }));
  const request = deps.request ?? (httpsRequest as unknown as Request);
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkPublicUrl(current);
    if (!check.ok) return { ok: false, reason: check.reason };
    const got = await getOnce(check.url, resolve, request, kind === "html" ? "text/html,application/xhtml+xml" : "application/json");
    if (!got.ok) return got;
    const { status, location, contentType, body } = got.value;
    if (status >= 300 && status < 400) {
      if (!location) return { ok: false, reason: "The site sent a redirect without an address." };
      current = new URL(location, check.url).toString();
      continue;
    }
    if (status < 200 || status >= 300) return { ok: false, reason: `The site answered ${status}.` };
    const wanted = kind === "html" ? /text\/html|application\/xhtml\+xml/i : /json/i;
    if (!wanted.test(contentType)) return { ok: false, reason: "That link isn't a web page." };
    return { ok: true, value: { url: check.url.toString(), body } };
  }
  return { ok: false, reason: "Too many redirects." };
}

/** The public web for previews and official embeds. `metaToken`: an app token with oEmbed Read (docs/share-to-oppllo.md). */
export function publicWeb(opts: { metaToken?: string | null; metaVersion?: string; deps?: { resolve?: Resolve; request?: Request } } = {}): PublicWeb {
  const json = async <T>(url: string): Promise<WebRead<T>> => {
    const r = await fetchPublic(url, "json", opts.deps);
    if (!r.ok) return r;
    try {
      return { ok: true, value: JSON.parse(r.value.body) as T };
    } catch {
      return { ok: false, reason: "The answer couldn't be read." };
    }
  };
  return {
    async page(url) {
      const r = await fetchPublic(url, "html", opts.deps);
      return r.ok ? { ok: true, value: { url: r.value.url, html: r.value.body } } : r;
    },
    async youtube(url) {
      const r = await json<{ title?: string; author_name?: string }>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      return r.ok ? { ok: true, value: { title: r.value.title ?? null, author: r.value.author_name ?? null } } : r;
    },
    async metaEmbed(url, kind) {
      if (!opts.metaToken) return { ok: false, reason: "not_configured" };
      const endpoint = kind === "instagram" ? "instagram_oembed" : /\/videos?\/|fb\.watch|\/reel\//.test(url) ? "oembed_video" : "oembed_post";
      const r = await json<{ html?: string; title?: string; author_name?: string; error?: { message?: string } }>(
        `https://graph.facebook.com/${opts.metaVersion || "v23.0"}/${endpoint}?url=${encodeURIComponent(url)}&maxwidth=540&access_token=${encodeURIComponent(opts.metaToken)}`,
      );
      if (!r.ok) return r;
      if (!r.value.html) return { ok: false, reason: r.value.error?.message ?? "Meta didn't give an embed for that post." };
      return { ok: true, value: { html: r.value.html, title: r.value.title ?? null, author: r.value.author_name ?? null } };
    },
  };
}
