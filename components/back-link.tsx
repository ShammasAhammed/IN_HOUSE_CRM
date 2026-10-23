"use client";

// "Back" to wherever the person came from (My Day, the Board, a project), or to a sensible page when opened directly.
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackLink({ fallback, label = "Back" }: { fallback: Route; label?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        // Only go back within the app; a link opened from WhatsApp has nowhere to go back to.
        if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" /> {label}
    </Link>
  );
}
