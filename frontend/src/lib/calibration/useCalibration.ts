import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { customFetch } from "@/api/client";
import { useSocket } from "@/lib/auth/useSocket";

// DS-E11-F4-S1 — interim hook layer for the admin calibration endpoints.
//
// The Orval-generated client in `src/api/generated/admin/admin.ts` was last
// regenerated before this story added the typed Swagger responses for
// `GET /admin/investors/:userId/calibration` and
// `POST /admin/investors/:userId/calibration/recompute`. Once `bun
// generate:api` is re-run against a live backend the calibration call sites
// can be flipped to use `useAdminControllerGetInvestorCalibrationSummary` /
// `useAdminControllerRecomputeInvestorCalibrationSummary` and this module
// can shrink to a wrapper or be removed.
//
// We deliberately reuse the same `customFetch` mutator the generated hooks
// use, so this stays on the same auth/refresh/backoff path as the rest of
// the app — no second fetch implementation, no risk of bypassing 401
// recovery. The "no raw fetch" rule is satisfied.

export type CalibrationSnapshotStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface InvestorCalibrationLensDelta {
  lensKey: "team" | "market" | "traction";
  count: number;
  meanDelta: number;
  meanAbsDelta: number;
}

export interface InvestorCalibrationSummary {
  totalDecisions: number;
  decisionsWithTriage: number;
  aligned: number;
  falsePositive: number;
  falseNegative: number;
  softMismatch: number;
  alignmentRate: number | null;
  topOverrideReasons: Array<{ reasonTag: string; count: number }>;
  recentMismatches: Array<{
    startupId: string;
    decidedAt: string;
    mismatchType: "false_positive" | "false_negative" | "soft_mismatch";
    modelVerdict: "advance" | "review" | "reject";
    investorVerdict: "advance" | "pass" | "hold";
    reasonTags: string[];
  }>;
  /**
   * DS-E11-F2-S1 — DD-vs-screening lens deltas per overlapping lens
   * (`team`, `market`, `traction`). Empty when no evaluation has yet
   * completed for a previously-screened deal under this investor's
   * matches.
   */
  lensDeltas: InvestorCalibrationLensDelta[];
}

export interface InvestorCalibrationSnapshot {
  investorId: string;
  status: CalibrationSnapshotStatus;
  summary: InvestorCalibrationSummary;
  computedAt: string | null;
  lastJobId: string | null;
  lastError: string | null;
  enqueuedAt: string | null;
}

export interface RecomputeCalibrationResponse {
  investorId: string;
  jobId: string;
  status: "queued" | "in_progress";
  dedupedToExistingJob: boolean;
}

export interface CalibrationRecomputeCompletedEvent {
  investorId: string;
  jobId: string;
  computedAt: string;
}

export interface CalibrationRecomputeFailedEvent {
  investorId: string;
  jobId: string;
  error: string;
}

export function getInvestorCalibrationQueryKey(userId: string | null) {
  return ["admin", "investors", userId, "calibration"] as const;
}

export function useInvestorCalibration(
  userId: string | null,
  options?: Omit<
    UseQueryOptions<InvestorCalibrationSnapshot, Error>,
    "queryKey" | "queryFn" | "enabled"
  >,
) {
  return useQuery<InvestorCalibrationSnapshot, Error>({
    ...options,
    queryKey: getInvestorCalibrationQueryKey(userId),
    queryFn: () =>
      customFetch<InvestorCalibrationSnapshot>(
        `/admin/investors/${userId}/calibration`,
      ),
    enabled: Boolean(userId),
  });
}

export function useRecomputeInvestorCalibration(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<RecomputeCalibrationResponse, Error>({
    mutationKey: ["admin", "investors", userId, "calibration", "recompute"],
    mutationFn: async () => {
      if (!userId) {
        throw new Error(
          "Cannot recompute calibration without a selected investor",
        );
      }
      return customFetch<RecomputeCalibrationResponse>(
        `/admin/investors/${userId}/calibration/recompute`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      // Optimistically refetch so the card transitions to the queued state
      // straight away even if the WS event lands a beat later.
      void queryClient.invalidateQueries({
        queryKey: getInvestorCalibrationQueryKey(userId),
      });
    },
  });
}

/**
 * Subscribe to the WS events emitted by the calibration recompute job and
 * invalidate the cached snapshot when one lands. The admin's socket is
 * scoped to their user id so other admins' recomputes don't pollute this
 * UI, but the payload includes `investorId` to filter to the open tab.
 */
export function useInvestorCalibrationSocket(
  userId: string | null,
  handlers?: {
    onCompleted?: (event: CalibrationRecomputeCompletedEvent) => void;
    onFailed?: (event: CalibrationRecomputeFailedEvent) => void;
  },
) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !userId) return;

    const handleCompleted = (event: CalibrationRecomputeCompletedEvent) => {
      if (event.investorId !== userId) return;
      void queryClient.invalidateQueries({
        queryKey: getInvestorCalibrationQueryKey(userId),
      });
      handlers?.onCompleted?.(event);
    };
    const handleFailed = (event: CalibrationRecomputeFailedEvent) => {
      if (event.investorId !== userId) return;
      void queryClient.invalidateQueries({
        queryKey: getInvestorCalibrationQueryKey(userId),
      });
      handlers?.onFailed?.(event);
    };

    socket.on(
      "investor.calibration.recompute.completed",
      handleCompleted,
    );
    socket.on("investor.calibration.recompute.failed", handleFailed);

    return () => {
      socket.off(
        "investor.calibration.recompute.completed",
        handleCompleted,
      );
      socket.off("investor.calibration.recompute.failed", handleFailed);
    };
    // handlers is intentionally not in the dep array — we want a fresh
    // closure each render but no resubscription churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, userId, queryClient]);
}

// DS-E11-F3-S1 — investor's review/approve/reject calibration proposals.
//
// Endpoints live on the investor controller (NOT admin) and are gated by
// the investor's own auth. We reuse the same `customFetch` mutator as the
// admin hooks above — same auth/refresh/backoff path, no second fetch
// implementation.
//
// The Orval-generated client doesn't yet cover these endpoints; once
// `bun generate:api` is re-run the call sites can be flipped to the
// generated hooks and this block can shrink.

export type CalibrationProposalStatus = "pending" | "approved" | "rejected";

export interface CalibrationProposalSuggestedDelta {
  lensAdjustments: Array<{
    lensKey: "team" | "market" | "traction";
    adjustment: number;
  }>;
  overrideTagFocus: string[];
}

export interface CalibrationProposalEvidence {
  topOverrideReasons: Array<{ reasonTag: string; count: number }>;
  lensDeltaSummary: InvestorCalibrationLensDelta[];
}

export interface CalibrationProposal {
  id: string;
  investorUserId: string;
  status: CalibrationProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  suggestedDelta: CalibrationProposalSuggestedDelta;
  evidence: CalibrationProposalEvidence;
  rejectionReason: string | null;
  idempotencyKey: string;
  snapshotHash: string;
}

export interface CalibrationProposalCreatedEvent {
  investorId: string;
  proposalId: string;
  createdAt: string;
}

export function getCalibrationProposalsQueryKey(
  status: CalibrationProposalStatus = "pending",
) {
  return ["investor", "calibration", "proposals", status] as const;
}

export function useCalibrationProposals(
  status: CalibrationProposalStatus = "pending",
  options?: Omit<
    UseQueryOptions<CalibrationProposal[], Error>,
    "queryKey" | "queryFn"
  >,
) {
  const queryClient = useQueryClient();
  const socket = useSocket();

  // Auto-invalidate the cached list when a NEW proposal lands. The WS
  // event is fired by the recompute job's proposal hook so investors
  // see the suggestion without a page refresh.
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      void queryClient.invalidateQueries({
        queryKey: ["investor", "calibration", "proposals"],
      });
    };
    socket.on("investor.calibration.proposal.created", handler);
    return () => {
      socket.off("investor.calibration.proposal.created", handler);
    };
  }, [socket, queryClient]);

  return useQuery<CalibrationProposal[], Error>({
    ...options,
    queryKey: getCalibrationProposalsQueryKey(status),
    queryFn: () =>
      customFetch<CalibrationProposal[]>(
        `/investor/calibration/proposals?status=${encodeURIComponent(status)}`,
      ),
  });
}

export function useApproveCalibrationProposal() {
  const queryClient = useQueryClient();
  return useMutation<CalibrationProposal, Error, string>({
    mutationKey: ["investor", "calibration", "proposals", "approve"],
    mutationFn: (proposalId: string) =>
      customFetch<CalibrationProposal>(
        `/investor/calibration/proposals/${proposalId}/approve`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["investor", "calibration", "proposals"],
      });
    },
  });
}

export function useRejectCalibrationProposal() {
  const queryClient = useQueryClient();
  return useMutation<
    CalibrationProposal,
    Error,
    { proposalId: string; reason?: string }
  >({
    mutationKey: ["investor", "calibration", "proposals", "reject"],
    mutationFn: ({ proposalId, reason }) =>
      customFetch<CalibrationProposal>(
        `/investor/calibration/proposals/${proposalId}/reject`,
        {
          method: "POST",
          body: JSON.stringify(reason ? { reason } : {}),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["investor", "calibration", "proposals"],
      });
    },
  });
}
