// The frame around every signed-in screen. The frame is static (instant); the parts that depend on who is
// signed in stream in behind Suspense boundaries.
import Image from "next/image";
import Link from "next/link";
import { cache, Suspense } from "react";
import { Bell, LogOut, Search } from "lucide-react";
import { getServices } from "@/lib/server/container";
import { getActor } from "@/lib/server/session";
import { ROLE_LABELS } from "@/lib/types";
import { can } from "@/services/permissions";
import { Avatar } from "../ui/avatar";
import { Skeleton } from "../ui/skeleton";
import { NAV } from "./nav";
import { signOutAction } from "./actions";
import { NavLink } from "./nav-link";
import { SearchBox } from "./search-box";
import { RunningTimer } from "../timer/timer-bits";
import { NewVersionBanner } from "./new-version";
import { MoreMenu } from "./more-menu";
import { countOf } from "@/lib/format";

async function visibleNav() {
  const actor = await getActor();
  if (!actor) return [];
  const aiOn = getServices().ai.switchedOn();
  return NAV.filter((item) => (!item.anyOf || item.anyOf.some((cap) => can(actor, cap))) && (!item.needsAi || aiOn));
}

/** Unread chat messages, once per request (the sidebar and the phone menu both show it). */
const chatUnread = cache(async () => {
  const actor = await getActor();
  return actor ? getServices().chat.unreadTotal(actor) : 0;
});

async function ChatCount({ variant }: { variant: "sidebar" | "tile" }) {
  const n = await chatUnread();
  if (!n) return null;
  return (
    <span className={variant === "sidebar" ? "tabular ml-auto rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground" : "tabular -mt-1 rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground"}>
      <span className="sr-only">, </span>
      {n > 99 ? "99+" : n}
      <span className="sr-only"> unread</span>
    </span>
  );
}

async function SidebarNav() {
  const items = await visibleNav();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {items.map((item) => (
        <NavLink key={item.href} href={item.href}>
          <item.icon />
          {item.label}
          {item.chatCount ? (
            <Suspense fallback={null}>
              <ChatCount variant="sidebar" />
            </Suspense>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

/** Phone tabs: four everyday sections, then "More" with everything else the person can see (test report H5). */
const TAB_HREFS = ["/", "/tasks", "/attendance", "/leave"];

async function TabBar() {
  const all = await visibleNav();
  if (all.length === 0) return null;
  const tabs = TAB_HREFS.map((h) => all.find((i) => i.href === h)).filter((i) => i !== undefined);
  const rest = all.filter((i) => !tabs.includes(i));
  const unread = rest.some((i) => i.chatCount) ? await chatUnread() : 0;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map((item) => (
        <NavLink key={item.href} href={item.href} variant="tab">
          <item.icon />
          {item.label}
        </NavLink>
      ))}
      <MoreMenu active={false} dot={unread > 0}>
        <div className="grid grid-cols-3 gap-1">
          {rest.map((item) => (
            <NavLink key={item.href} href={item.href} variant="tile">
              <item.icon />
              {item.label}
              {item.chatCount ? (
                <Suspense fallback={null}>
                  <ChatCount variant="tile" />
                </Suspense>
              ) : null}
            </NavLink>
          ))}
        </div>
        <form action={signOutAction} className="mt-3 border-t pt-3">
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-sm text-muted-foreground hover:bg-hover hover:text-foreground">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </MoreMenu>
    </nav>
  );
}

/** The bell: unread notifications (Stage 8.1). Its own Suspense, so the count never holds up the shell. */
async function BellCount() {
  const actor = await getActor();
  const n = actor ? await getServices().notifications.unreadCount(actor) : 0;
  return (
    <Link href="/notifications" title="Notifications" className="relative rounded-md p-2 text-muted-foreground hover:bg-hover hover:text-foreground">
      <Bell className="size-4" />
      <span className="sr-only">{n ? `${countOf(n, "unread notification")}` : "Notifications"}</span>
      {n ? <span className="tabular absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">{n > 99 ? "99+" : n}</span> : null}
    </Link>
  );
}

/** The running timer, if any (Stage 9b.5). Its own Suspense so it never holds up the frame. */
async function TimerChip({ compact = false }: { compact?: boolean }) {
  const actor = await getActor();
  const t = actor ? await getServices().timers.running(actor) : null;
  return t ? <RunningTimer compact={compact} timer={{ taskId: t.taskId, taskTitle: t.taskTitle, clientName: t.clientName, startedAt: t.startedAt.toISOString() }} /> : null;
}

function BellSlot() {
  return (
    <Suspense fallback={<span className="size-8" />}>
      <BellCount />
    </Suspense>
  );
}

/** Phone header: timer, search, the bell and the avatar. Sign out is in the More menu, away from the bell. */
async function MobileUser() {
  const actor = await getActor();
  if (!actor) return null;
  return (
    <div className="flex items-center gap-1">
      <Suspense fallback={null}>
        <TimerChip compact />
      </Suspense>
      <Link href="/search" title="Search" className="rounded-md p-2 text-muted-foreground hover:bg-hover hover:text-foreground">
        <Search className="size-4" />
        <span className="sr-only">Search</span>
      </Link>
      <BellSlot />
      <span className="hidden min-[420px]:inline-flex">
        <Avatar name={actor.fullName} size="sm" />
      </span>
    </div>
  );
}

async function UserMenu() {
  const actor = await getActor();
  if (!actor) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
      <Avatar name={actor.fullName} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{actor.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{actor.roles.map((r) => ROLE_LABELS[r]).join(", ")}</p>
      </div>
      <BellSlot />
      <form action={signOutAction}>
        <button type="submit" title="Sign out" className="rounded-md p-1.5 text-muted-foreground hover:bg-hover hover:text-foreground">
          <LogOut className="size-4" />
          <span className="sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-1">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" aria-label="Oppllo One, home" className="flex items-center gap-2 px-1.5">
      <Image src="/oppllo-icon.png" alt="" width={24} height={24} className="rounded-md" priority />
      <span className="text-[15px] font-semibold tracking-tight">Oppllo One</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // The sidebar's 232px is also used by the floating bulk bars (tasks, leads) to stay beside it.
  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-sidebar px-3 py-4 md:flex">
        <Brand />
        <div className="mt-4 space-y-2">
          <SearchBox />
          <Suspense fallback={null}>
            <TimerChip />
          </Suspense>
        </div>
        <div className="mt-4 flex-1">
          <Suspense fallback={<NavSkeleton />}>
            <SidebarNav />
          </Suspense>
        </div>
        <Suspense fallback={<Skeleton className="h-10 w-full" />}>
          <UserMenu />
        </Suspense>
      </aside>
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Brand />
        <Suspense fallback={<Skeleton className="size-6 rounded-full" />}>
          <MobileUser />
        </Suspense>
      </header>
      <main className="min-w-0 px-4 pt-5 pb-24 md:px-8 md:pt-7 md:pb-10">
        {/* Pages are capped at 6xl; a page holding an element with data-wide (the Board, the Week view) uses the full width. */}
        <div className="mx-auto w-full max-w-6xl has-[[data-wide]]:max-w-none">{children}</div>
      </main>
      <Suspense fallback={null}>
        <TabBar />
      </Suspense>
      <NewVersionBanner version={process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "dev"} />
    </div>
  );
}
