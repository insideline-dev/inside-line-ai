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
export type ScreeningEvidenceSourceType =
  | "deck_page"
  | "public_url"
  | "enrichment_call"
  | "research_source"
  | "internal_trace";

export interface ScreeningEvidence {
  claim: string;
  source?: string;
  confidence: ScreeningEvidenceConfidence;
  sourceType?: ScreeningEvidenceSourceType;
  sourceLabel?: string;
  sourceRef?: string;
  url?: string;
  pageNumber?: number;
  quote?: string;
}

export interface ScreeningHandoffEvidenceV1 extends ScreeningEvidence {
  lensKey: string;
  lensLabel: string;
  lensScore: number;
  signal: ScreeningSignal;
}

export interface ScreeningHandoffIssueV1 {
  key: string;
  label: string;
  summary: string;
  source: "screening-output" | "triage-decision";
}

export interface ScreeningHandoffV1 {
  evidenceSeeds: ScreeningHandoffEvidenceV1[];
  openIssues: ScreeningHandoffIssueV1[];
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

export interface ScreeningLensScoreV2 {
  key: "market" | "team" | "traction";
  score: number;
  signal: ScreeningSignal;
  rationale?: string;
}

export interface ScreeningOutputV1 {
  version: 1 | 2;
  startupId: string;
  pipelineRunId: string | null;
  generatedAt: string;
  overall: ScreeningOverallV1;
  handoff?: ScreeningHandoffV1;
  lenses: ScreeningLensV1[];
  thesisFit?: unknown | null;
  lensScores?: ScreeningLensScoreV2[];
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
