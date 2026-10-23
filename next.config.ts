import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  experimental: {
    // The ClickUp import sends the export's open tasks in one request, and the document locker takes files up to
    // 3.5 MB. Kept under Vercel's 4.5 MB request limit; both screens check the size first.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // No other site may frame Oppllo One: above all the screen where a person approves an AI app (D87). The one
  // exception: live cards on Idea Boards (Stage 13.2, D-13.2a) are framed by Oppllo One's own board page, nobody else.
  async headers() {
    return [
      { source: "/((?!board-cards/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] },
      { source: "/board-cards/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
