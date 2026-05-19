/** DS-E8-F2-S1 — deal agent re-wake jobs on the shared TASK queue. */
export const DEAL_TRIGGER_JOB = "deal.trigger" as const;

export const DEAL_TRIGGER_DEDUPE_MS = 30_000;

export type DealTriggerPayload =
  | { type: "doc.uploaded"; startupId: string; fileId: string }
  | { type: "deck.revised"; startupId: string }
  | { type: "thesis.updated"; investorUserId: string };

export function dealTriggerJobId(payload: DealTriggerPayload): string {
  switch (payload.type) {
    case "doc.uploaded":
      return `deal-trigger:doc:${payload.startupId}:${payload.fileId}`;
    case "deck.revised":
      return `deal-trigger:deck:${payload.startupId}`;
    case "thesis.updated":
      return `deal-trigger:thesis:${payload.investorUserId}`;
  }
}
