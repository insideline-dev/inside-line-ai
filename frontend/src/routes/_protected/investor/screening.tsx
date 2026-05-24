import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { ScreeningDealCard } from "@/components/investor/ScreeningDealCard";
import type {
  LensScore,
  ScreeningVerdict,
} from "@/components/investor/screening-types";
import type { ThesisFitOutput } from "@/types/thesis-fit";

interface BackendScreeningRow {
  id: string;
  companyName: string;
  industry: string | null;
  stage: string | null;
  website: string | null;
  verdict: ScreeningVerdict;
  overallScore: number;
  fit: ThesisFitOutput | null;
  lensScores: Array<{
    key: "market" | "team" | "traction";
    label: string;
    score: number;
    signal: string;
    note?: string;
  }>;
  triageRationale: string;
  reasonCodes: string[];
  submittedAt: string;
  dealbreakerNote: string | null;
}

function fetchScreeningQueue() {
  return customFetch<BackendScreeningRow[]>("/investor/screening");
}

export const Route = createFileRoute("/_protected/investor/screening")({
  component: ScreeningPage,
});

interface ScreeningRow {
  id: string;
  companyName: string;
  industry?: string | null;
  stage?: string | null;
  website?: string | null;
  verdict: ScreeningVerdict;
  overallScore?: number;
  fit: ThesisFitOutput | null;
  lensScores: LensScore[];
  triageRationale: string;
  submittedAt: string;
  dealbreakerNote?: string | null;
}

function mapBackendRow(row: BackendScreeningRow): ScreeningRow {
  return {
    id: row.id,
    companyName: row.companyName,
    industry: row.industry,
    stage: row.stage,
    website: row.website,
    verdict: row.verdict,
    overallScore: row.overallScore,
    fit: row.fit,
    lensScores: row.lensScores.map((l) => ({
      key: l.key,
      label: l.label,
      score: l.score,
      note: l.note,
    })),
    triageRationale: row.triageRationale,
    submittedAt: row.submittedAt,
    dealbreakerNote: row.dealbreakerNote,
  };
}

function ScreeningPage() {
  const queryClient = useQueryClient();
  const { data: backendRows, isLoading, error } = useQuery({
    queryKey: ["investor", "screening"],
    queryFn: fetchScreeningQueue,
    staleTime: 30_000,
  });

  const invalidateStageQueries = () => {
    // After PASS or ADVANCE, all four stage surfaces may need to refetch:
    //   - screening: the row leaves the active queue
    //   - investor pipeline (DD list): an advanced deal might appear here
    //     once synthesis completes; even before that, refetching wakes any
    //     count badges
    //   - admin screening: admin sees the same row globally
    //   - startup detail: status/verdict surfaces change
    queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["investor", "pipeline"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "screening"] });
    // Orval generates startup-controller keys with this prefix
    queryClient.invalidateQueries({ queryKey: ["startupController"] });
  };

  const advanceMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean; startupId: string; verdict: "advance"; note: string }>(
        `/investor/screening/${startupId}/advance`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success("Advanced to Due Diligence", { description: res.note });
      invalidateStageQueries();
    },
    onError: (err) =>
      toast.error("Advance failed", { description: (err as Error).message }),
  });

  const passMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean; startupId: string; verdict: "reject" }>(
        `/investor/screening/${startupId}/pass`,
        { method: "POST" },
      ),
    onSuccess: () => {
      toast.success("Marked as passed — moved to rejected archive.");
      invalidateStageQueries();
    },
    onError: (err) =>
      toast.error("Pass failed", { description: (err as Error).message }),
  });

  // Pessimistic local mirror so PASS/ADVANCE update the row immediately.
  // Source of truth is the backend; we patch verdict in-place on action.
  const sourceRows = useMemo<ScreeningRow[]>(
    () => (Array.isArray(backendRows) ? backendRows.map(mapBackendRow) : []),
    [backendRows],
  );

  const [overrides, setOverrides] = useState<
    Record<string, Partial<ScreeningRow>>
  >({});
  const rows = useMemo(
    () =>
      sourceRows.map((r) => ({ ...r, ...(overrides[r.id] ?? {}) })),
    [sourceRows, overrides],
  );
  const setRows = useCallback(
    (mutator: (prev: ScreeningRow[]) => ScreeningRow[]) => {
      // We mutate via `overrides` so refetched backend rows still flow through.
      const before = sourceRows.map((r) => ({ ...r, ...(overrides[r.id] ?? {}) }));
      const after = mutator(before);
      const next: Record<string, Partial<ScreeningRow>> = { ...overrides };
      for (let i = 0; i < after.length; i++) {
        const diff: Partial<ScreeningRow> = {};
        const b = before[i];
        const a = after[i];
        if (a.verdict !== b.verdict) diff.verdict = a.verdict;
        if (a.dealbreakerNote !== b.dealbreakerNote)
          diff.dealbreakerNote = a.dealbreakerNote;
        if (Object.keys(diff).length > 0) {
          next[a.id] = { ...(next[a.id] ?? {}), ...diff };
        }
      }
      setOverrides(next);
    },
    [sourceRows, overrides],
  );

  const [showRejected, setShowRejected] = useState(false);

  const { activeRows, rejectedRows, advancedRowIds } = useMemo(() => {
    // Screening tab shows only deals awaiting partner action.
    //   - REVIEW: needs Pass/Advance
    //   - REJECT: auto-rejected, lives in collapsed archive
    //   - ADVANCE: deal has left screening; lives in the DD tab.
    // Filtering out 'advance' here matches the plan's "ADVANCE → deal
    // leaves Screening tab" behavior.
    const active = rows.filter((r) => r.verdict === "review");
    const rejected = rows.filter((r) => r.verdict === "reject");
    const advanced = new Set(
      rows.filter((r) => r.verdict === "advance").map((r) => r.id),
    );
    return { activeRows: active, rejectedRows: rejected, advancedRowIds: advanced };
  }, [rows]);

  const handlePass = useCallback(
    (id: string) => {
      // Optimistic local update; the mutation invalidates the query on
      // success so the server state replaces it.
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, verdict: "reject", dealbreakerNote: "Passed by investor" } : r,
        ),
      );
      passMutation.mutate(id);
    },
    [passMutation, setRows],
  );

  const handleAdvance = useCallback(
    (id: string) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, verdict: "advance" } : r)),
      );
      advanceMutation.mutate(id);
    },
    [advanceMutation, setRows],
  );

  return (
    <div className="flex flex-col gap-4">
      <StageNav counts={{ screening: activeRows.length }} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Deal Screening</h1>
        <span className="text-sm text-muted-foreground">
          First-pass triage — should we spend more time on this?
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading screening queue…
        </div>
      ) : activeRows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-6 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4" />
          No deals in screening yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activeRows.map((row) => (
            <ScreeningDealCard
              key={row.id}
              data={{
                id: row.id,
                companyName: row.companyName,
                industry: row.industry,
                stage: row.stage,
                website: row.website,
                verdict: row.verdict,
                overallScore: row.overallScore,
                fit: row.fit,
                lensScores: row.lensScores,
                submittedAt: row.submittedAt,
                dealbreakerNote: row.dealbreakerNote,
                isAutoAdvanced: advancedRowIds.has(row.id),
              }}
              onPass={handlePass}
              onAdvance={handleAdvance}
            />
          ))}
        </div>
      )}

      {rejectedRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowRejected((v) => !v)}
            data-testid="toggle-rejected-archive"
          >
            {showRejected ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Show rejected ({rejectedRows.length})
          </button>
          {showRejected && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {rejectedRows.map((row) => (
                <ScreeningDealCard
                  key={row.id}
                  data={{
                    id: row.id,
                    companyName: row.companyName,
                    industry: row.industry,
                    stage: row.stage,
                    website: row.website,
                    verdict: row.verdict,
                    overallScore: row.overallScore,
                    fit: row.fit,
                    lensScores: row.lensScores,
                    submittedAt: row.submittedAt,
                    dealbreakerNote: row.dealbreakerNote,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
          Failed to load screening queue: {(error as Error).message}
        </div>
      )}
    </div>
  );
}

