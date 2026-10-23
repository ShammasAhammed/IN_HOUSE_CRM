"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export function NavLink({ href, children, variant = "sidebar" }: { href: Route; children: React.ReactNode; variant?: "sidebar" | "tab" | "tile" }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        variant === "sidebar" &&
          "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-foreground-2 transition-colors hover:bg-hover hover:text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground",
        variant === "sidebar" && active && "bg-accent text-accent-foreground hover:bg-accent [&_svg]:text-primary",
        variant === "tab" &&
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground [&_svg]:size-5",
        variant === "tab" && active && "text-primary",
        variant === "tile" && "flex flex-col items-center gap-1 rounded-md px-1 py-3 text-center text-xs font-medium text-foreground-2 hover:bg-hover [&_svg]:size-5 [&_svg]:text-muted-foreground",
        variant === "tile" && active && "bg-accent text-accent-foreground [&_svg]:text-primary",
      )}
    >
      {children}
    </Link>
  );
}
