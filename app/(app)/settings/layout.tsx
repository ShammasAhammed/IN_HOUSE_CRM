import { PageHeader } from "@/components/page-header";
import { TabsNav } from "@/components/tabs-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <PageHeader title="Settings" description="What Oppllo sells, how projects start, and the working week. Leave types and holidays are under Leave." />
      <TabsNav
        tabs={[
          { href: "/settings", label: "Services", exact: true },
          { href: "/settings/week", label: "Working week" },
          { href: "/settings/ai", label: "AI" },
          { href: "/settings/import", label: "Import from ClickUp" },
          { href: "/settings/trust", label: "Trust" },
          { href: "/settings/audit", label: "Audit log" },
          { href: "/design", label: "Design system" },
        ]}
      />
      {children}
    </>
  );
}
