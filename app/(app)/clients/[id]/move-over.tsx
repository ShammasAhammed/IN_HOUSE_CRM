// Moving a client off WhatsApp (Stage 12.6): messages to copy (English and Malayalam) and the client's checklist,
// ticked from real data where it can be (invited, signed in, first message); closing the WhatsApp group is a person's.
import { Check, Circle } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { formatShortDate } from "@/lib/format";

export function moveOverTexts(clientName: string, from: string) {
  return {
    inviteEn: `Hello! From now on you can see ${clientName}'s results, approve our creatives, send requests and message the Oppllo team in one place: the Oppllo client portal. Please look for the email from Oppllo One with your sign-in link (it works once). Thank you!`,
    inviteMl: `നമസ്കാരം! ഇനി മുതൽ ${clientName}-ന്റെ ഫലങ്ങൾ കാണാനും ഞങ്ങളുടെ ക്രിയേറ്റീവുകൾ അംഗീകരിക്കാനും ആവശ്യങ്ങൾ അറിയിക്കാനും Oppllo ടീമിന് മെസ്സേജ് അയക്കാനും ഒരൊറ്റ ഇടം: Oppllo ക്ലയന്റ് പോർട്ടൽ. സൈൻ ഇൻ ലിങ്കുള്ള Oppllo One ഇമെയിൽ നോക്കുക (ലിങ്ക് ഒരു തവണ മാത്രം പ്രവർത്തിക്കും). നന്ദി!`,
    groupEn: `Hello everyone! From ${from}, please message us in the Oppllo client portal (Messages) instead of this group. Approvals, files and requests stay together there and nothing gets lost. Your sign-in link is in your email. We'll close this group after ${from}. Thank you!`,
    groupMl: `എല്ലാവർക്കും നമസ്കാരം! ${from} മുതൽ ഈ ഗ്രൂപ്പിന് പകരം Oppllo ക്ലയന്റ് പോർട്ടലിലെ Messages-ൽ ഞങ്ങൾക്ക് മെസ്സേജ് അയക്കുക. അംഗീകാരങ്ങളും ഫയലുകളും ആവശ്യങ്ങളും അവിടെ ഒരുമിച്ച് ഉണ്ടാകും, ഒന്നും നഷ്ടപ്പെടില്ല. സൈൻ ഇൻ ലിങ്ക് നിങ്ങളുടെ ഇമെയിലിലുണ്ട്. ${from}-ന് ശേഷം ഈ ഗ്രൂപ്പ് ക്ലോസ് ചെയ്യും. നന്ദി!`,
  };
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? <Check className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
      <span className={done ? "" : "text-muted-foreground"}>{children}</span>
    </li>
  );
}

export function MoveOver({ clientName, invited, signedIn, firstMessage, from }: { clientName: string; invited: boolean; signedIn: boolean; firstMessage: Date | null; from: string }) {
  const t = moveOverTexts(clientName, formatShortDate(from));
  return (
    <details className="rounded-md border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">Move this client off WhatsApp</summary>
      <div className="mt-2 space-y-3">
        <ol className="space-y-1">
          <Step done={invited}>Invited to the portal</Step>
          <Step done={signedIn}>Signed in</Step>
          <Step done={Boolean(firstMessage)}>First message in the portal{firstMessage ? ` (${formatShortDate(firstMessage.toISOString().slice(0, 10))})` : ""}</Step>
          <Step done={false}>WhatsApp group closed (you do this yourself)</Step>
        </ol>
        {(
          [
            ["Invite message (English)", t.inviteEn],
            ["Invite message (Malayalam)", t.inviteMl],
            ["For the WhatsApp group (English)", t.groupEn],
            ["For the WhatsApp group (Malayalam)", t.groupMl],
          ] as const
        ).map(([label, text]) => (
          <div key={label} className="space-y-1">
            <p className="flex items-center justify-between gap-2 text-xs font-medium">
              {label} <CopyButton text={text} />
            </p>
            <p className="rounded bg-subtle px-2 py-1.5 text-xs whitespace-pre-wrap">{text}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
