import { Suspense } from "react";
import { LoadingRows } from "@/components/states";
import { requirePortalUser } from "@/lib/server/session";
import { PortalShell } from "../portal-shell";

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser();
  return <PortalShell clientName={user.clientName}>{children}</PortalShell>;
}

export default function SignedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingRows rows={4} columns={2} label="Loading" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
