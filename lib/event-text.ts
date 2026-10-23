// Plain-language lines for the history feed: "Rahul completed “Weekly ad check”". Every event a client's history can
// show has a sentence, with statuses by their labels (QA S4-B4); anything unknown says "made a change", never a code.
import { CLIENT_STATUS_LABELS, CONTENT_STATUS_LABELS, PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from "./types";

type EventLike = { action: string; data: Record<string, unknown> };

const quote = (v: unknown) => (typeof v === "string" && v ? `“${v}”` : "");
const label = (labels: Record<string, string>, v: unknown) => (typeof v === "string" ? (labels[v] ?? v.replace(/_/g, " ")) : "");
const ENGAGEMENT_STATUS_WORDS: Record<string, string> = { draft: "Draft", active: "Active", paused: "Paused", ended: "Ended" };
const creative = (d: Record<string, unknown>) => quote(d.title) || "a creative";

export function eventText(e: EventLike): string {
  const d = e.data;
  switch (e.action) {
    case "client.created":
      return "added the client";
    case "client.updated":
      return "updated the client's details";
    case "client.status_changed":
      return `marked the client ${label(CLIENT_STATUS_LABELS, d.to)}`;
    case "client.contact_added":
      return `added the contact ${quote(d.name)}`;
    case "client.contact_updated":
      return `updated the contact ${quote(d.name)}`;
    case "client.contact_removed":
      return `removed the contact ${quote(d.name)}`;
    case "client.member_added":
      return `added ${typeof d.name === "string" ? d.name : "someone"} to the team`;
    case "client.member_removed":
      return `took ${typeof d.name === "string" ? d.name : "someone"} off the team`;
    case "engagement.created":
      return `started a ${d.kind === "one_off" ? "one-off job" : "retainer"}`;
    case "engagement.updated":
      return "updated an engagement";
    case "engagement.status_changed":
      return `marked an engagement ${label(ENGAGEMENT_STATUS_WORDS, d.to)}`;
    case "engagement.fee_changed":
      return "changed the fee";
    case "deliverable.created":
      return `added the deliverable ${quote(d.name)}`;
    case "deliverable.updated":
      return `changed the deliverable ${quote(d.name)}`;
    case "deliverable.removed":
      return `removed the deliverable ${quote(d.name)}`;
    case "project.created":
      return `started the project ${quote(d.name)}`;
    case "project.stage_changed":
      return `moved a project to ${quote(d.to)}`;
    case "project.status_changed":
      return `marked a project ${label(PROJECT_STATUS_LABELS, d.to)}`;
    case "task.created":
      return `added ${quote(d.title) || "a task"}`;
    case "task.completed":
      return `completed ${quote(d.title) || "a task"}`;
    case "task.reopened":
      return `reopened ${quote(d.title) || "a task"}`;
    case "task.status_changed":
      return `moved ${quote(d.title) || "a task"} to ${label(TASK_STATUS_LABELS, d.to)}`;
    case "task.reassigned":
      return `gave ${quote(d.title) || "a task"} to someone else`;
    case "task.updated":
      return `changed ${quote(d.title) || "a task"}`;
    case "task.tagged":
      return `changed the tags on ${quote(d.title) || "a task"}`;
    case "task.commented":
      return "commented on a task";
    case "task.deleted":
      return `deleted ${quote(d.title) || "a task"}`;
    case "time.logged":
      return "logged time";
    case "time.changed":
      return "changed logged time";
    case "time.removed":
      return "removed logged time";
    case "task_recurrence.created":
      return `set up the recurring task ${quote(d.title)}`;
    case "task_recurrence.updated":
      return `changed the recurring task ${quote(d.title)}`;
    case "task_recurrence.paused":
      return `paused the recurring task ${quote(d.title)}`;
    case "task_recurrence.resumed":
      return `resumed the recurring task ${quote(d.title)}`;
    case "task_recurrence.removed":
      return `stopped the recurring task ${quote(d.title)}`;
    case "asset.approved":
    case "asset.approve":
      return `approved ${creative(d)} inside the team`;
    case "asset.created":
      return `added the creative ${creative(d)}`;
    case "asset.version_added":
      return `uploaded a new version of ${creative(d)}`;
    case "asset.submit":
      return `sent ${creative(d)} for review`;
    case "asset.request_changes":
      return `asked for changes to ${creative(d)}`;
    case "asset.send_to_client":
      return `sent ${creative(d)} to the client`;
    case "asset.client_approved":
      return `recorded the client's approval of ${creative(d)}`;
    case "asset.client_changes":
      return `recorded the client's changes to ${creative(d)}`;
    case "asset.commented":
      return `commented on ${creative(d)}`;
    case "content.created":
      return `planned the post ${quote(d.title) || ""}`.trim();
    case "content.updated":
      return "changed a planned post";
    case "content.status_changed": {
      const to = (d.changes as Record<string, [unknown, unknown]> | undefined)?.status?.[1];
      return to ? `marked a post ${label(CONTENT_STATUS_LABELS, to)}` : "changed a post's status";
    }
    case "content.ready":
      return "a post is ready: its creative was approved";
    case "content.removed":
      return `took ${quote(d.title) || "a post"} off the calendar`;
    case "automation.created":
      return `set up the automation ${quote(d.name)}`.trim();
    case "automation.changed":
      return `changed the automation ${quote(d.name)}`.trim();
    case "automation.ran":
      return "an automation changed a task";
    case "automation.removed":
      return "removed an automation";
    case "request_form.submitted":
      return `sent a request${typeof d.from === "string" && d.from ? ` (from ${d.from})` : ""}`;
    case "client.ad_account_linked":
      return "linked an ad account";
    case "client.ad_account_unlinked":
      return "unlinked an ad account";
    case "client.results_saved":
      return "updated the monthly results";
    case "client.knowledge_saved":
      return "updated the tone of voice and do's and don'ts";
    case "client.campaign_added":
      return `added the past campaign ${quote(d.name)}`;
    case "client.campaign_removed":
      return `removed the past campaign ${quote(d.name)}`;
    case "client.file_added":
      return `added ${quote(d.title) || "a file"} to the knowledge base`;
    case "task.ai_draft_created":
      return `asked the AI teammate for a ${typeof d.kindLabel === "string" ? d.kindLabel.toLowerCase() : "draft"}`;
    case "task.ai_draft_approved":
      return `approved the AI's ${typeof d.kindLabel === "string" ? d.kindLabel.toLowerCase() : "draft"}${d.edited ? " (edited)" : ""}`;
    case "task.ai_draft_rejected":
      return `rejected the AI's ${typeof d.kindLabel === "string" ? d.kindLabel.toLowerCase() : "draft"}`;
    case "client.report_created":
      return `started the ${typeof d.monthLabel === "string" ? d.monthLabel : "monthly"} report`;
    case "client.report_saved":
      return `edited the ${typeof d.monthLabel === "string" ? d.monthLabel : "monthly"} report${d.ai ? " (AI draft)" : ""}`;
    case "client.report_finalized":
      return `made the ${typeof d.monthLabel === "string" ? d.monthLabel : "monthly"} report final`;
    case "space.created":
      return `added the space ${quote(d.name)}${d.isPrivate ? " (private)" : ""}`;
    case "space.updated":
      return "changed the space's name, privacy or archive";
    case "space.member_added":
      return `added ${typeof d.name === "string" ? d.name : "someone"} to the space`;
    case "space.member_removed":
      return `took ${typeof d.name === "string" ? d.name : "someone"} out of the space`;
    case "space.access_requested":
      return `asked for ${typeof d.level === "string" ? d.level : ""} access for ${typeof d.name === "string" ? d.name : "someone"} to ${quote(d.space)}`;
    case "space.access_approved":
      return `approved access for ${typeof d.name === "string" ? d.name : "someone"} to ${quote(d.space)}${d.ownerAlone ? " (owner alone: no HR person)" : ""}`;
    case "space.access_refused":
      return `refused access for ${typeof d.name === "string" ? d.name : "someone"} to ${quote(d.space)}`;
    case "space.access_confirmed":
      return `confirmed their access to ${quote(d.space)} ("I understand")`;
    case "space.access_removed":
      return `removed access to ${quote(d.space)}${d.reason ? ` (${d.reason})` : ""}`;
    case "space.access_expired":
      return `access to ${quote(d.space)} ended on its date`;
    case "space.access_carried_over":
      return `kept access to ${quote(d.space)} from before approvals (edit)`;
    case "space.access_reviewed":
      return `reviewed who is in ${quote(d.space)}`;
    case "chat.channel_created":
      return d.kind === "direct" ? "started a direct message" : d.kind === "client" ? "opened the client's chat" : `started the channel ${quote(d.name)}`;
    case "chat.channel_renamed":
      return `renamed the channel to ${quote(d.to)}`;
    case "chat.channel_archived":
      return `archived the channel ${quote(d.name)}`;
    case "chat.channel_unarchived":
      return `brought back the channel ${quote(d.name)}`;
    case "chat.member_added":
      return `added ${typeof d.name === "string" ? d.name : "someone"} to ${quote(d.channel)}`;
    case "chat.member_removed":
      return `took ${typeof d.name === "string" ? d.name : "someone"} out of ${quote(d.channel)}`;
    case "chat.message_sent":
      return d.file ? "shared a file in chat" : "sent a chat message";
    case "chat.message_edited":
      return "changed a chat message";
    case "coworker.suggested":
      return `the AI co-worker suggested: ${quote(d.title)}`;
    case "coworker.approved":
      return "approved an AI co-worker suggestion";
    case "coworker.partly_approved":
      return `approved an AI co-worker suggestion (${typeof d.failed === "number" ? d.failed : "some"} change(s) couldn't be made)`;
    case "coworker.approve_failed":
      return "tried to approve an AI co-worker suggestion, but none of its changes could be made";
    case "coworker.changed":
      return "changed an AI co-worker suggestion before approving it";
    case "coworker.dismissed":
      return "dismissed an AI co-worker suggestion";
    case "coworker.snoozed":
      return d.onClientReply ? "snoozed an AI co-worker suggestion until the client replies" : `snoozed an AI co-worker suggestion until ${typeof d.until === "string" ? d.until : "later"}`;
    case "coworker.woke":
      return "an AI co-worker suggestion came back from snooze";
    case "assistant.promise_settled":
      return "settled one of their own promises";
    case "chat.message_removed":
      return "removed a chat message";
    case "portal.invited":
      return `invited ${typeof d.name === "string" ? d.name : "a contact"} to the client portal`;
    case "portal.revoked":
      return `revoked ${typeof d.name === "string" ? d.name : "a contact"}'s portal access`;
    case "portal.signed_in":
      return `${typeof d.by === "string" ? d.by : "A client contact"} signed in to the client portal`;
    case "portal.request_sent":
      return `${typeof d.by === "string" ? d.by : "The client"} sent a request: ${quote(d.title)}`;
    case "consent.recorded":
      return `recorded consent${typeof d.purpose === "string" ? ` for “${d.purpose}”` : ""}`;
    case "consent.withdrawn":
      return `recorded a withdrawal of consent${typeof d.purpose === "string" ? ` for “${d.purpose}”` : ""}`;
    case "client.file_removed":
      return `removed ${quote(d.title) || "a file"} from the knowledge base`;
    case "client.drive_folder_made":
      return "made the client's Drive folder";
    case "invoice.drafted":
      return "drafted an invoice";
    case "engagement.renewal":
      return "renewal is coming up";
    case "engagement.burn":
      return "a retainer passed a budget mark";
    // Stages 13–14: pages, boards, meetings, goals, templates and space kits.
    case "doc.created":
      return `wrote the page ${quote(d.title)}`;
    case "doc.updated":
      return `edited the page ${quote(d.title)}`;
    case "doc.commented":
      return `commented on ${quote(d.title) || "a page"}`;
    case "board.created":
      return `started the board ${quote(d.title)}`;
    case "board.stickies_added":
    case "board.mind_map_added":
    case "board.section_added":
      return `added to the board ${quote(d.title)}`;
    case "meeting.created":
      return `set up the meeting ${quote(d.title)}`;
    case "meeting.action_approved":
      return "made a task from a meeting's action item";
    case "meeting.next_created":
      return "made the next meeting of a series";
    case "goal.created":
      return `set the goal ${quote(d.title)}`;
    case "goal.changed":
      return `changed the goal ${quote(d.title)}`;
    case "goal.checked_in":
      return `checked in on ${quote(d.title) || "a goal"}`;
    case "goal.archived":
      return `archived the goal ${quote(d.title)}`;
    case "gallery_template.used":
      return `started ${quote(d.name) || "something"} from a template`;
    case "space_kit.applied":
      return `set up the space with the ${typeof d.kit === "string" ? d.kit : ""} kit`.replace("  ", " ");
    default:
      if (e.action.startsWith("doc_table.")) return `changed a table${d.title ? ` (${quote(d.title)})` : ""}`;
      if (e.action.startsWith("board.")) return `worked on the board ${quote(d.title)}`.trim();
      return "made a change";
  }
}
