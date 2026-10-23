// Email through Resend's HTTP API (plan: "email via Resend adapter"). Only this file knows Resend exists.
import type { Mailer } from "@/repositories";

export function resendMailer(deps: { apiKey: string; from: string; fetch?: typeof fetch }): Mailer {
  const http = deps.fetch ?? fetch;
  return {
    async send({ to, subject, text }) {
      const res = await http("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: deps.from, to: [to], subject, text }),
      });
      if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${await res.text()}`);
    },
  };
}

/** Development and until Resend is set up: emails are written to the server log instead of sent. */
export function logMailer(): Mailer {
  return {
    async send({ to, subject }) {
      console.info(`[email not sent: RESEND_API_KEY unset] to ${to}: ${subject}`);
    },
  };
}
