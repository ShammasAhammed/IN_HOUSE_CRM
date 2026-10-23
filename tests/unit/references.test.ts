// References on boards (Stage 13.2): the SSRF guard (addresses, links, DNS answers, redirects, rebinding), what a link
// is, reading a page's preview, Meta oEmbed without a token, and live card links.
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { fetchPublic, publicWeb, type Request, type Resolve } from "@/adapters/web/public-web";
import { cardUrl, checkPublicUrl, classifyLink, isPublicIp, parseCardUrl, parsePreview, youtubeEmbed } from "@/services/rules/references";

describe("isPublicIp", () => {
  it("refuses private, loopback, link-local, metadata and reserved addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "127.8.8.8", "0.0.0.0", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "224.0.0.1", "255.255.255.255", "198.18.0.1"]) expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ["::1", "::", "[::1]", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "64:ff9b::10.0.0.1", "2001:db8::1", "ff02::1", "fe80::1%en0"]) expect(isPublicIp(ip), ip).toBe(false);
  });
  it("accepts public addresses, and refuses what it can't read", () => {
    for (const ip of ["8.8.8.8", "142.250.183.14", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicIp(ip), ip).toBe(true);
    for (const ip of ["", "999.1.1.1", "1.2.3", "not-an-ip", "1::2::3"]) expect(isPublicIp(ip), ip).toBe(false);
  });
});

describe("checkPublicUrl", () => {
  it("only https on 443 to public names", () => {
    expect(checkPublicUrl("https://example.com/a?b=1").ok).toBe(true);
    for (const u of ["http://example.com", "ftp://example.com", "https://user:pw@example.com", "https://example.com:8443/", "https://localhost/", "https://127.0.0.1/", "https://[::1]/", "https://169.254.169.254/latest/meta-data", "https://intranet/", "https://printer.local/", "https://cards.oppllo.invalid/x", "file:///etc/passwd", "not a url"]) expect(checkPublicUrl(u).ok, u).toBe(false);
  });
});

describe("classifyLink and cards", () => {
  it("finds YouTube ids, Instagram and Facebook", () => {
    expect(classifyLink(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"))).toEqual({ kind: "youtube", videoId: "dQw4w9WgXcQ" });
    expect(classifyLink(new URL("https://youtu.be/dQw4w9WgXcQ"))).toEqual({ kind: "youtube", videoId: "dQw4w9WgXcQ" });
    expect(classifyLink(new URL("https://youtube.com/shorts/dQw4w9WgXcQ"))).toEqual({ kind: "youtube", videoId: "dQw4w9WgXcQ" });
    expect(classifyLink(new URL("https://www.instagram.com/reel/Cx1/")).kind).toBe("instagram");
    expect(classifyLink(new URL("https://m.facebook.com/page/posts/1")).kind).toBe("facebook");
    expect(classifyLink(new URL("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).kind).toBe("link");
    expect(youtubeEmbed("dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
  it("card links round-trip and reject anything else", () => {
    const id = "01a15900-3bca-7097-b8f9-d0d2d4c7e3e8";
    expect(parseCardUrl(cardUrl("task", id))).toEqual({ kind: "task", id });
    for (const l of ["https://evil.example/task/" + id, "https://cards.oppllo.invalid/admin/" + id, "https://cards.oppllo.invalid/task/1", null]) expect(parseCardUrl(l)).toBeNull();
  });
});

describe("parsePreview", () => {
  it("reads Open Graph first, then plain tags; keeps only public https pictures", () => {
    const html = `<html><head><title>Plain &amp; title</title><meta name="description" content="Plain description">
      <meta property="og:title" content="NEET &quot;crash&quot; course"><meta property="og:image" content="/img/cover.jpg">
      <meta property="og:site_name" content="Zenith"></head><body>x</body></html>`;
    expect(parsePreview(html, "https://zenith.example/neet")).toEqual({ title: 'NEET "crash" course', description: "Plain description", image: "https://zenith.example/img/cover.jpg", site: "Zenith" });
    expect(parsePreview(`<title>T</title><meta property="og:image" content="http://10.0.0.1/x.png">`, "https://a.example/").image).toBeNull();
    expect(parsePreview("<p>no head</p>", "https://www.a.example/").site).toBe("a.example");
  });
});

// ---------- the fetcher, with fake DNS and connections ----------

type Reply = { status: number; headers?: Record<string, string>; body?: string };
function fakeNet(dns: Record<string, string[]>, replies: Record<string, Reply>) {
  const seen: Array<{ host: string; path: string; connectedTo: string }> = [];
  const resolve: Resolve = async (host) => {
    if (!dns[host]) throw new Error("ENOTFOUND");
    return dns[host]!.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  const request: Request = (opts, onResponse) => {
    const req = new EventEmitter() as EventEmitter & { setTimeout: () => void; destroy: () => void; end: () => void };
    req.setTimeout = () => undefined;
    req.destroy = () => undefined;
    req.end = () => {
      // Where the connection would really go: through the lookup the fetcher passed in.
      (opts.lookup as unknown as (h: string, o: object, cb: (e: null, a: string) => void) => void)(String(opts.host), {}, (_e, address) => {
        seen.push({ host: String(opts.host), path: String(opts.path), connectedTo: address });
        const r = replies[`${opts.host}${opts.path}`] ?? { status: 404 };
        const res = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void; destroy: () => void };
        res.statusCode = r.status;
        res.headers = { "content-type": "text/html; charset=utf-8", ...r.headers };
        res.resume = () => undefined;
        res.destroy = () => undefined;
        onResponse(res as never);
        setTimeout(() => {
          if (r.body) res.emit("data", Buffer.from(r.body));
          res.emit("end");
        }, 0);
      });
    };
    return req;
  };
  return { resolve, request, seen };
}

describe("fetchPublic (SSRF guard)", () => {
  it("fetches a public page", async () => {
    const net = fakeNet({ "a.example": ["93.184.216.34"] }, { "a.example/x": { status: 200, body: "<title>Hi</title>" } });
    const r = await fetchPublic("https://a.example/x", "html", net);
    expect(r).toEqual({ ok: true, value: { url: "https://a.example/x", body: "<title>Hi</title>" } });
  });
  it("refuses a name that resolves to a private address, or to any private one among several", async () => {
    const net = fakeNet({ "evil.example": ["10.0.0.5"], "mixed.example": ["93.184.216.34", "127.0.0.1"], "six.example": ["::1"] }, {});
    for (const u of ["https://evil.example/", "https://mixed.example/", "https://six.example/"]) expect((await fetchPublic(u, "html", net)).ok, u).toBe(false);
    expect(net.seen).toEqual([]);
  });
  it("refuses a redirect to a private host, and stops after three redirects", async () => {
    const net = fakeNet(
      { "a.example": ["93.184.216.34"], "inside.example": ["192.168.0.10"] },
      {
        "a.example/go": { status: 302, headers: { location: "https://inside.example/admin" } },
        "a.example/meta": { status: 301, headers: { location: "http://169.254.169.254/latest/meta-data" } },
        "a.example/1": { status: 302, headers: { location: "/2" } },
        "a.example/2": { status: 302, headers: { location: "/3" } },
        "a.example/3": { status: 302, headers: { location: "/4" } },
        "a.example/4": { status: 302, headers: { location: "/5" } },
      },
    );
    expect(await fetchPublic("https://a.example/go", "html", net)).toEqual({ ok: false, reason: "That address isn't on the public internet." });
    expect(await fetchPublic("https://a.example/meta", "html", net)).toEqual({ ok: false, reason: "Only https links can be previewed." });
    expect(await fetchPublic("https://a.example/1", "html", net)).toEqual({ ok: false, reason: "Too many redirects." });
    expect(net.seen.some((s) => s.host === "inside.example")).toBe(false);
  });
  it("connects to the address it checked, whatever DNS says next (rebinding)", async () => {
    let calls = 0;
    const net = fakeNet({}, { "rebind.example/": { status: 200, body: "ok" } });
    // First answer public, every later answer private: the connection must still go to the checked address.
    const resolve: Resolve = async () => [{ address: calls++ === 0 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
    const r = await fetchPublic("https://rebind.example/", "html", { resolve, request: net.request });
    expect(r.ok).toBe(true);
    expect(net.seen).toEqual([{ host: "rebind.example", path: "/", connectedTo: "93.184.216.34" }]);
  });
  it("reads only the expected content type and at most 512 KB", async () => {
    const net = fakeNet({ "a.example": ["93.184.216.34"] }, { "a.example/pdf": { status: 200, headers: { "content-type": "application/pdf" }, body: "%PDF" }, "a.example/big": { status: 200, body: "x".repeat(600_000) } });
    expect(await fetchPublic("https://a.example/pdf", "html", net)).toEqual({ ok: false, reason: "That link isn't a web page." });
    const big = await fetchPublic("https://a.example/big", "html", net);
    expect(big.ok && big.value.body.length).toBe(512_000);
  });
});

describe("Meta oEmbed", () => {
  it("without a token says not_configured (the card falls back to Open on Instagram)", async () => {
    expect(await publicWeb({ metaToken: null }).metaEmbed("https://www.instagram.com/p/abc/", "instagram")).toEqual({ ok: false, reason: "not_configured" });
  });
});
