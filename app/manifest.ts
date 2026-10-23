import type { MetadataRoute } from "next";

/** Installable on phones (D53): opens straight to My Day. No offline cache — the data is private and live (D74). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oppllo One",
    short_name: "Oppllo One",
    description: "Oppllo Digital's work system: My Day, approvals, clients and people.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#7f21c2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Share to Oppllo (Stage 13.2): Android's share menu sends links, text and pictures here (iPhone: docs/share-to-oppllo.md).
    share_target: {
      action: "/api/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "image", accept: ["image/png", "image/jpeg", "image/webp", "image/gif"] }] },
    },
    shortcuts: [
      { name: "My Day", url: "/" },
      { name: "Leave", url: "/leave" },
      { name: "Approvals", url: "/leave/approvals" },
      { name: "Swipe file", url: "/swipe" },
    ],
  };
}
