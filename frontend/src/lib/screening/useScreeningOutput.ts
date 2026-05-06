// Hand-rolled hook for the v1 ScreeningOutput contract (DS-E9-F1-S1).
// Mirrors useTriageDecision: degrades 404 → null so the deal card can
// render a graceful "no evidence yet" state without erroring out.
//
// TODO: once the Orval-generated `useScreeningTriageControllerGetOutput`
// signature is verified to handle 404 → null cleanly under our customFetch,
// replace this with the generated hook directly.

import { useQuery } from "@tanstack/react-query";
import { ApiError, customFetch } from "@/api/client";

export type ScreeningSignal = "advance" | "review" | "reject";
export type ScreeningEvidenceConfidence = "low" | "medium" | "high";

export interface ScreeningEvidence {
  claim: string;
  source?: string;
  confidence: ScreeningEvidenceConfidence;
}

export interface ScreeningLensV1 {
  key: string;
  score: number;
  signal: ScreeningSignal;
  rationale: string;
  evidence: ScreeningEvidence[];
  modelId: string;
  promptKey: string;
  latencyMs: number;
  usedFallback: boolean;
}

export interface ScreeningOverallV1 {
  score: number;
  signal: ScreeningSignal;
  nextAction:
    | "continue_evaluation"
    | "manual_review"
    | "request_materials"
    | "stop";
  missingMaterials: string[];
}

export interface ScreeningOutputV1 {
  version: 1;
  startupId: string;
  pipelineRunId: string | null;
  generatedAt: string;
  overall: ScreeningOverallV1;
  lenses: ScreeningLensV1[];
}

export const screeningOutputQueryKey = (startupId: string) =>
  ["screening", "output", startupId] as const;

export function useScreeningOutput(startupId: string) {
  return useQuery<ScreeningOutputV1 | null>({
    queryKey: screeningOutputQueryKey(startupId),
    queryFn: async () => {
      try {
        return await customFetch<ScreeningOutputV1>(
          `/screening/${startupId}/output`,
        );
      } catch (err) {
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
