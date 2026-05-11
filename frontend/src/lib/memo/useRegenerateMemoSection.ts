// Hand-rolled mutation for `POST /startups/:startupId/memo/sections/:sectionKey/regenerate`
// (DG-E1-F1-S2). Replace with the Orval-generated hook once `bun generate:api`
// is re-run against the live backend.
//
// On success we invalidate the evaluation query so the memo tab refreshes its
// section, but we deliberately do NOT clear the cache — refetching the whole
// evaluation is acceptable because only the single section payload on the
// server has changed, and TanStack Query will diff-render the rest.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/client";
import { getStartupControllerGetEvaluationByIdQueryKey } from "@/api/generated/startups/startups";

export type MemoSectionKey =
  | "team"
  | "market"
  | "product"
  | "traction"
  | "businessModel"
  | "gtm"
  | "financials"
  | "competitiveAdvantage"
  | "legal"
  | "dealTerms"
  | "exitPotential";

export interface RegeneratedMemoSection {
  sectionKey: MemoSectionKey;
  title: string;
  content: string;
  highlights: string[];
  concerns: string[];
  sources: Array<{ label: string; url: string }>;
  regeneratedAt: string;
}

export interface RegenerateMemoSectionResponse {
  startupId: string;
  sectionKey: MemoSectionKey;
  regeneratedAt: string;
  usedFallback: boolean;
  overwroteOperatorEdits: boolean;
  section: RegeneratedMemoSection;
}

interface RegenerateVariables {
  startupId: string;
  sectionKey: MemoSectionKey;
}

export async function regenerateMemoSection(
  variables: RegenerateVariables,
): Promise<RegenerateMemoSectionResponse> {
  return customFetch<RegenerateMemoSectionResponse>(
    `/startups/${variables.startupId}/memo/sections/${variables.sectionKey}/regenerate`,
    { method: "POST" },
  );
}

export function useRegenerateMemoSection(startupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sectionKey: MemoSectionKey) =>
      regenerateMemoSection({ startupId, sectionKey }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getStartupControllerGetEvaluationByIdQueryKey(startupId),
      });
    },
  });
}
