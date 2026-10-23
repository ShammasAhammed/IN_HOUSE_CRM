import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { RequestForm } from "../portal-forms";

export const metadata: Metadata = { title: "Requests", robots: { index: false, follow: false } };

export default function PortalRequestsPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Send a request</h1>
      <p className="text-sm text-muted-foreground">It goes straight to your Oppllo team as a task.</p>
      <Card>
        <CardContent className="pt-4">
          <RequestForm />
        </CardContent>
      </Card>
    </>
  );
}
