/**
 * Manual hook for the funding-history endpoint. This will be replaced
 * by an Orval-generated hook on the next `bun generate:api` run; until
 * then it follows the same shape as other interim hooks (DataRoomPanel)
 * by using `customFetch` + TanStack Query directly.
 *
 * DG-E11-F1-S1.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@/api/client";
import type {
  FundingHistoryListResponse,
  FundingHistoryRow,
} from "@/types/startup";

interface EnrichFundingResponse {
  startupId: string;
  providersAttempted: string[];
  providersWithMatches: string[];
  rows: FundingHistoryRow[];
}

export const fundingHistoryQueryKey = (startupId: string) =>
  ["startups", startupId, "funding-history"] as const;

export function useFundingHistory(startupId: string, enabled = true) {
  return useQuery<FundingHistoryListResponse>({
    queryKey: fundingHistoryQueryKey(startupId),
    queryFn: () =>
      customFetch<FundingHistoryListResponse>(
        `/startups/${startupId}/funding-history`,
      ),
    enabled: enabled && Boolean(startupId),
  });
}

/**
 * Admin-only mutation to manually re-pull canonical funding sources for a
 * startup. Invalidates the read query on success so the UI refreshes.
 */
export function useReEnrichFundingHistory(startupId: string) {
  const queryClient = useQueryClient();
  return useMutation<EnrichFundingResponse, Error, void>({
    mutationFn: () =>
      customFetch<EnrichFundingResponse>(
        `/startups/${startupId}/enrichment/funding`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: fundingHistoryQueryKey(startupId),
      });
    },
  });
}
