// The portal's frame: the Oppllo mark, the client's name, four places, sign out. Phone first.
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { portalSignOutAction } from "./actions";

const TABS: Array<{ href: Route; label: string }> = [
  { href: "/portal" as Route, label: "Home" },
  { href: "/portal/messages" as Route, label: "Messages" },
  { href: "/portal/creatives" as Route, label: "Creatives" },
  { href: "/portal/requests" as Route, label: "Requests" },
  { href: "/portal/reports" as Route, label: "Reports" },
];

export function PortalShell({ clientName, children }: { clientName: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-subtle">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Image src="/oppllo-logo.png" alt="Oppllo" width={88} height={30} className="h-auto w-[88px] dark:invert" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{clientName}</span>
          <form action={portalSignOutAction}>
            <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
        <nav aria-label="Portal" className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">{children}</main>
    </div>
  );
}
