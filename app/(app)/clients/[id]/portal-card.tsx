// The client portal on the client page (Stage 11.6): which contacts can sign in, inviting them, removing access.
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { getServices } from "@/lib/server/container";
import { requireActor } from "@/lib/server/session";
import { addDays, istDate } from "@/lib/dates";
import { MoveOver } from "./move-over";
import { InviteButton, RevokeButton } from "./portal-forms";

export async function PortalCard({ clientId, clientName }: { clientId: string; clientName?: string }) {
  const actor = await requireActor();
  const [r, firstMessage] = await Promise.all([getServices().portal.invites(actor, clientId), getServices().chat.firstClientMessage(actor, clientId)]);
  if (!r.ok) return null;
  const { contacts, emailReady } = r.value;
  const invites = contacts.map((c) => c.invite).filter((i) => i && i.status !== "revoked");
  // The WhatsApp group message names a day a week ahead (the staff edit it before sending).
  const from = addDays(istDate(), 7);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Client portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Invited contacts see this month&apos;s results, approve creatives, send requests, read final reports and message the team (the chat marked &quot;Client sees&quot;). Never hours, fees or internal notes.
          {emailReady ? "" : " Email sending isn't set up yet: you'll get the link to pass on."}
        </p>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a contact with an email first.</p>
        ) : (
          <ul className="space-y-3">
            {contacts.map((c) => {
              const live = c.invite && c.invite.status !== "revoked" ? c.invite : null;
              return (
                <li key={c.contactId} className="space-y-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                    {live ? <Badge tone={live.status === "active" ? "success" : "info"}>{live.status === "active" ? "Signed in" : "Invited"}</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.email ?? "No email"}
                    {live?.lastSignInAt ? ` · last in ${formatDateTime(live.lastSignInAt)}` : ""}
                    {live ? ` · invited by ${live.invitedByName}` : ""}
                  </p>
                  {live ? <RevokeButton portalUserId={live.id} name={c.name} /> : c.email ? <InviteButton clientId={clientId} contactId={c.contactId} name={c.name} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        <MoveOver clientName={clientName ?? "the client"} invited={invites.length > 0} signedIn={invites.some((i) => i?.lastSignInAt)} firstMessage={firstMessage} from={from} />
      </CardContent>
    </Card>
  );
}
