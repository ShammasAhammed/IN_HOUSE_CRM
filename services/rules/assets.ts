// Creative approval (plan/3-projects-module.md, "Creative approval"; D80). Pure rules, unit-tested.
//
// A version is uploaded, goes to internal review, then to the client, and ends approved or with changes asked.
// - Whoever makes the creative sends it for review; a strategist or the owner (assets.approve) reviews it.
// - Clients don't sign in: the reviewer records what the client said, with a note ("Principal OK on WhatsApp").
// - Oppllo's own work (an internal client) has no client step: the internal review approves it.
// - A new version starts the review again. The last approved version stays the approved one (the only one to
//   publish) until a newer one is approved. Every version is kept.

import type { ApprovalState, ReviewAction } from "@/lib/types";

type Step = { from: readonly ApprovalState[]; to: ApprovalState; by: "maker" | "reviewer"; internalClient?: boolean; noteRequired?: boolean };

export const REVIEW_STEPS: Record<ReviewAction, Step> = {
  submit: { from: ["draft", "changes_requested"], to: "internal_review", by: "maker" },
  send_to_client: { from: ["internal_review"], to: "client_review", by: "reviewer", internalClient: false },
  approve: { from: ["internal_review"], to: "approved", by: "reviewer", internalClient: true },
  request_changes: { from: ["internal_review"], to: "changes_requested", by: "reviewer", noteRequired: true },
  // Who approved and where is the only proof there is, since clients don't sign in (test report L14).
  client_approved: { from: ["client_review"], to: "approved", by: "reviewer", noteRequired: true },
  client_changes: { from: ["client_review"], to: "changes_requested", by: "reviewer", noteRequired: true },
};

export const REVIEW_ACTION_LABELS: Record<ReviewAction, string> = {
  submit: "Send for review",
  send_to_client: "Send to client",
  approve: "Approve",
  request_changes: "Ask for changes",
  client_approved: "Client approved",
  client_changes: "Client asked for changes",
};

/** What the thread says when the step is taken. */
export const REVIEW_ACTION_PAST: Record<ReviewAction, string> = {
  submit: "sent it for review",
  send_to_client: "sent it to the client",
  approve: "approved it",
  request_changes: "asked for changes",
  client_approved: "recorded the client's approval",
  client_changes: "recorded the client's changes",
};

export type ReviewContext = { state: ApprovalState; internalClient: boolean; hasVersion: boolean; canMake: boolean; canReview: boolean };

/** The state after `action`, or null when it can't be taken now (wrong state, no version, or not this client). */
export function nextState(state: ApprovalState, action: ReviewAction, internalClient: boolean): ApprovalState | null {
  const step = REVIEW_STEPS[action];
  if (!step.from.includes(state)) return null;
  if (step.internalClient !== undefined && step.internalClient !== internalClient) return null;
  return step.to;
}

/** The steps this person can take now, in the order a screen should offer them. */
export function availableActions(ctx: ReviewContext): ReviewAction[] {
  if (!ctx.hasVersion) return [];
  return (Object.keys(REVIEW_STEPS) as ReviewAction[]).filter((action) => {
    const step = REVIEW_STEPS[action];
    const allowed = step.by === "maker" ? ctx.canMake : ctx.canReview;
    return allowed && nextState(ctx.state, action, ctx.internalClient) !== null;
  });
}

/** After a new version: back to review (or a draft when it isn't sent yet). Approved work stays approved until then. */
export function stateAfterNewVersion(submit: boolean): ApprovalState {
  return submit ? "internal_review" : "draft";
}
