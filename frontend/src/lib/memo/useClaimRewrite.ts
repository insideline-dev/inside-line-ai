// Hand-rolled mutation hooks for the DG-E1-F3-S1 inline-claim-edit flow:
//
//   1. `useSuggestClaimRewrite` — calls `POST /startups/:startupId/memo/claims/rewrite`
//      and returns up to 3 candidate rewrites.
//   2. `useApplyClaimRewrite`  — persists the accepted rewrite through the
//      DG-E1-F1-S2 section-regeneration JSON-merge path
//      (`POST /startups/:startupId/memo/sections/:sectionKey/apply-rewrite`).
//
// Mirrors `useRegenerateMemoSection.ts` — same `customFetch` mutator, same
// TanStack Query invalidation pattern. Replace with the Orval-generated
// hook once `bun generate:api` is re-run against a live backend.

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { customFetch } from "@/api/client";
import { getStartupControllerGetEvaluationByIdQueryKey } from "@/api/generated/startups/startups";
import type { MemoSectionKey } from "./useRegenerateMemoSection";

export interface MemoSectionSource {
  label: string;
  url: string;
}

export interface ClaimRewriteCandidate {
  text: string;
  /** Best-effort marker; empty when the rewrite is identical to the original. */
  diff: string;
}

export interface SuggestClaimRewriteRequest {
  sectionKey: MemoSectionKey;
  originalText: string;
  instruction?: string;
  sourceIds?: string[];
}

export interface SuggestClaimRewriteResponse {
  startupId: string;
  sectionKey: MemoSectionKey;
  originalText: string;
  rewrites: ClaimRewriteCandidate[];
  /** Total candidates returned by the model before the source-preservation guard ran. */
  candidateCountBeforeFilter: number;
  usedFallback: boolean;
}

export async function suggestClaimRewrite(
  startupId: string,
  body: SuggestClaimRewriteRequest,
): Promise<SuggestClaimRewriteResponse> {
  return customFetch<SuggestClaimRewriteResponse>(
    `/startups/${startupId}/memo/claims/rewrite`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function useSuggestClaimRewrite(startupId: string) {
  return useMutation({
    mutationFn: (body: SuggestClaimRewriteRequest) =>
      suggestClaimRewrite(startupId, body),
  });
}

export interface ApplyClaimRewriteRequest {
  sectionKey: MemoSectionKey;
  newContent: string;
  sources?: MemoSectionSource[];
}

export interface ApplyClaimRewriteResponse {
  startupId: string;
  sectionKey: MemoSectionKey;
  regeneratedAt: string;
  overwroteOperatorEdits: boolean;
  section: {
    sectionKey: MemoSectionKey;
    title: string;
    content: string;
    highlights: string[];
    concerns: string[];
    sources: MemoSectionSource[];
    regeneratedAt: string;
  };
}

export async function applyClaimRewrite(
  startupId: string,
  body: ApplyClaimRewriteRequest,
): Promise<ApplyClaimRewriteResponse> {
  const { sectionKey, ...rest } = body;
  return customFetch<ApplyClaimRewriteResponse>(
    `/startups/${startupId}/memo/sections/${sectionKey}/apply-rewrite`,
    {
      method: "POST",
      body: JSON.stringify(rest),
    },
  );
}

export function useApplyClaimRewrite(startupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyClaimRewriteRequest) =>
      applyClaimRewrite(startupId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getStartupControllerGetEvaluationByIdQueryKey(startupId),
      });
    },
  });
}
