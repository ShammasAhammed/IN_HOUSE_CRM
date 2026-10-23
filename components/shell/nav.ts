import { BookOpen, Bookmark, Flag, LayoutTemplate, Users2, Lightbulb, Building2, Inbox, ListChecks, LayoutDashboard, CalendarDays, CalendarRange, Clock, KanbanSquare, LayoutGrid, MapPinCheck, MessagesSquare, Palette, Settings, Sparkles, Sprout, Sun, Target, UserRound, Users, Zap, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import type { Capability } from "@/services/permissions";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Shown when the person has any of these; omit for everyone. */
  anyOf?: Capability[];
  /** Also shown in the mobile tab bar. */
  mobile?: boolean;
  /** Shows the person's unread chat messages beside it. */
  chatCount?: boolean;
  /** Only once the AI is switched on (an API key is set). */
  needsAi?: boolean;
};

// Grows as screens are built (BUILD-PLAN.md). Hiding an item is convenience; services enforce access.
export const NAV: NavItem[] = [
  { href: "/", label: "My Day", icon: Sun, mobile: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, anyOf: ["dashboard.read"] },
  // The assistant (Stage 9.2): everyone, with their own permissions.
  { href: "/ask", label: "Ask", icon: Sparkles, needsAi: true },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  // Chat (Stage 12.1): everyone on the team; channels follow who sees each client, space and person.
  { href: "/chat", label: "Chat", icon: MessagesSquare, chatCount: true },
  { href: "/board", label: "Board", icon: KanbanSquare },
  // Idea Boards (Stage 13.1): brainstorming canvases per client, project and space.
  { href: "/boards", label: "Idea boards", icon: Lightbulb },
  // The swipe file (Stage 13.2): saved references across the clients and spaces each person sees.
  { href: "/swipe", label: "Swipe file", icon: Bookmark },
  { href: "/week", label: "Week", icon: CalendarRange },
  { href: "/time", label: "Time", icon: Clock },
  // Request forms (Stage 9b.5): everyone can ask for work.
  { href: "/requests", label: "Requests", icon: Inbox },
  // Docs and wiki (Stage 9b.5).
  { href: "/docs", label: "Docs", icon: BookOpen },
  // Company and team goals (Stage 14.3): the founder dashboard; everyone sees what they may.
  { href: "/goals", label: "Goals", icon: Flag },
  // Template gallery (Stage 13.6): boards and pages to reuse, and presets.
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  // Meetings library (Stage 13.4): meeting pages, decisions, action items to tasks.
  { href: "/meetings", label: "Meetings", icon: Users2 },
  // Automation rules (Stage 9b.5): strategists and the owner.
  { href: "/automations", label: "Automations", icon: Zap, anyOf: ["projects.write"] },
  { href: "/attendance", label: "Attendance", icon: MapPinCheck, mobile: true },
  { href: "/me", label: "My page", icon: UserRound },
  { href: "/leave", label: "Leave", icon: CalendarDays, mobile: true },
  {
    href: "/clients",
    label: "Clients",
    icon: Building2,
    anyOf: ["clients.read.all", "clients.read.assigned", "clients.read.own_tasks"],
    mobile: true,
  },
  // Spaces (Stage 14.1): Oppllo's own work areas; private ones only for their members and the owner.
  { href: "/spaces", label: "Spaces", icon: LayoutGrid, anyOf: ["clients.read.all", "clients.read.assigned", "clients.read.own_tasks", "spaces.members"] },
  // Sales, moved in from the CRM (Stage 10a).
  { href: "/sales", label: "Sales", icon: Target, anyOf: ["leads.read"] },
  // Creatives in review (Stage 7). Interns reach their own from their tasks.
  { href: "/creatives", label: "Creatives", icon: Palette, anyOf: ["assets.read"] },
  // Skills and growth (plan/5): everyone has their own page.
  { href: "/growth", label: "Growth", icon: Sprout },
  { href: "/people", label: "People", icon: Users, mobile: true },
  // Services, stages, starter tasks, the working week; the living style guide is a tab inside.
  { href: "/settings", label: "Settings", icon: Settings, anyOf: ["settings.manage"] },
];
