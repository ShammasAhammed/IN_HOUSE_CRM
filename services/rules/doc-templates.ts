// Page templates (Stage 13.4): starting text for new pages, in the same Markdown pages are kept in. Pure.
// "Meeting notes" is also every meeting's page (its Decisions and Action items headings are read by rules).
export const DOC_TEMPLATES = ["blank", "client_onboarding", "meeting_notes", "sop", "campaign_brief", "monthly_review"] as const;
export type DocTemplate = (typeof DOC_TEMPLATES)[number];
export const DOC_TEMPLATE_LABELS: Record<DocTemplate, string> = {
  blank: "Blank",
  client_onboarding: "Client onboarding",
  meeting_notes: "Meeting notes",
  sop: "SOP",
  campaign_brief: "Campaign brief",
  monthly_review: "Monthly review",
};

export const MEETING_HEADINGS = { attendees: "Attendees", agenda: "Agenda", notes: "Notes", decisions: "Decisions", actions: "Action items" } as const;

export function meetingBody(opts: { attendees?: string[]; agenda?: string[]; carried?: string[] } = {}): string {
  const list = (items: string[] | undefined, empty: string) => (items?.length ? items.map((i) => `- ${i}`).join("\n") : empty);
  return [
    `## ${MEETING_HEADINGS.attendees}`,
    list(opts.attendees, "- "),
    `## ${MEETING_HEADINGS.agenda}`,
    list(opts.agenda, "1. "),
    `## ${MEETING_HEADINGS.notes}`,
    "",
    `## ${MEETING_HEADINGS.decisions}`,
    "- ",
    `## ${MEETING_HEADINGS.actions}`,
    opts.carried?.length ? opts.carried.join("\n") : "- [ ] Type @ to pick who, what, and by when (\"by Friday\", \"25 Oct\", \"naale\")",
  ]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function templateBody(t: DocTemplate): string {
  switch (t) {
    case "blank":
      return "";
    case "meeting_notes":
      return meetingBody();
    case "client_onboarding":
      return [
        ":::note\nFill this in during the client's first week. Logins stay in the password manager, never on this page.\n:::",
        "## About the client\n\n- Institution:\n- Courses:\n- Admission season:\n- Who decides:",
        "## Goals\n\n- [ ] Admissions target agreed\n- [ ] Budget agreed",
        "## Access\n\n- [ ] Meta Business Manager\n- [ ] Google Ads\n- [ ] Website or CMS\n- [ ] Brand kit received",
        "## Contacts\n\n| Name | Role | Phone |\n| --- | --- | --- |\n|  |  |  |",
        "## First 30 days\n\n- [ ] Kick-off call\n- [ ] Media plan\n- [ ] Content calendar\n- [ ] First report date",
      ].join("\n\n");
    case "sop":
      return [
        "## Purpose\n\nWhat this procedure is for, in one line.",
        "## When to use it\n\n- ",
        "## Steps\n\n1. \n2. \n3. ",
        "## Checklist\n\n- [ ] ",
        ":::warning\nCommon mistakes to avoid.\n:::",
        "## Owner and review\n\n| Owner | Last reviewed | Next review |\n| --- | --- | --- |\n|  |  |  |",
      ].join("\n\n");
    case "campaign_brief":
      return [
        "## Goal\n\nAdmissions target and by when.",
        "## Audience\n\n- Students:\n- Parents:",
        "## Offer and message\n\n- ",
        "## Channels and budget\n\n| Channel | Budget | Notes |\n| --- | --- | --- |\n| Meta |  |  |\n| Google |  |  |",
        "## Timeline\n\n- Launch:\n- Review:",
        "## Creatives needed\n\n- [ ] ",
        "## How we measure\n\n- Leads, cost per lead, admissions",
      ].join("\n\n");
    case "monthly_review":
      return [
        "## Results this month\n\n| Measure | Target | Actual | Notes |\n| --- | --- | --- | --- |\n| Leads |  |  |  |\n| Cost per lead |  |  |  |\n| Admissions |  |  |  |",
        "## What worked\n\n- ",
        "## What didn't\n\n- ",
        `## ${MEETING_HEADINGS.decisions}\n\n- `,
        "## Next month\n\n- [ ] ",
      ].join("\n\n");
  }
}
