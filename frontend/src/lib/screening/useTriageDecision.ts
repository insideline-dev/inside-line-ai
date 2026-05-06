// Hand-rolled hook that fetches the triage decision for a startup.
// TODO(DS-E7-F1): once `GET /screening/:startupId/decision` is committed and
// `bun generate:api` is re-run, replace this with the Orval-generated hook
// (likely `useScreeningControllerGetDecision`) and delete this file.

import { useQuery } from "@tanstack/react-query";
import { ApiError, customFetch } from "@/api/client";

export type TriageClassification = "advance" | "review" | "reject";

export interface TriageLensSnapshot {
  key: string;
  score: number;
  signal: "advance" | "review" | "reject" | "unknown";
  rationale?: string | null;
}

export interface TriageDecision {
  classification: TriageClassification;
  nextAction: "continue_evaluation" | "manual_review" | "request_materials" | "stop";
  overallScore: number;
  reasonCodes: string[];
  lensSnapshot: TriageLensSnapshot[];
  createdAt: string;
}

export const triageDecisionQueryKey = (startupId: string) =>
  ["screening", "decision", startupId] as const;

export function useTriageDecision(startupId: string) {
  return useQuery<TriageDecision | null>({
    queryKey: triageDecisionQueryKey(startupId),
    queryFn: async () => {
      try {
        return await customFetch<TriageDecision>(`/screening/${startupId}/decision`);
      } catch (err) {
        // 404 before the backend lands or for un-screened startups: treat as
        // "no decision yet" rather than a hard error so the card can render
        // a graceful empty state. Status-aware so the backend's 404 copy can
        // change without breaking this branch.
        if (err instanceof ApiError && err.status === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(startupId),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
