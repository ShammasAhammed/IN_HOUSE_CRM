"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export type Tab = { href: Route; label: string; count?: number; exact?: boolean };

/** Section tabs (e.g. My leave · Team calendar · Approvals). Scrolls sideways on phones. */
export function TabsNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 mb-5 overflow-x-auto border-b px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                  active && "border-primary text-foreground",
                )}
              >
                {t.label}
                {t.count ? <span className="tabular rounded-full bg-primary px-1.5 text-[11px] leading-4 text-primary-foreground">{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
