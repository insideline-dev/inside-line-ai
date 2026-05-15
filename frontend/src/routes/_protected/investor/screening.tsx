import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { ScreeningDealCard } from "@/components/investor/ScreeningDealCard";
import {
  ScreeningDetailModal,
  type LensScore,
  type ScreeningDetail,
  type ScreeningVerdict,
} from "@/components/investor/ScreeningDetailModal";
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

// PLACEHOLDER seed rows so the page renders end-to-end before PR4 wires
// the real screening pipeline to a real endpoint. Includes the
// California/US regression case (Acme — geography MATCH despite being
// labelled California) to validate the thesis-fit shape end-to-end.
const SEED_ROWS: ScreeningRow[] = [
  {
    id: "seed-1",
    companyName: "Acme AI",
    industry: "AI infrastructure",
    verdict: "review",
    submittedAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    fit: {
      geography: { status: "match", note: "California is part of US thesis" },
      stage: { status: "borderline", note: "Pre-seed against seed thesis" },
      sector: { status: "match", note: "AI infra aligned" },
      checkSize: { status: "mismatch", note: "$5M round vs $2M cap" },
      overall: 62,
      rationale:
        "Sector and geography are strong; check size is the blocker.",
    },
    lensScores: [
      { key: "market", label: "Market", score: 78, note: "Strong TAM signal" },
      { key: "team", label: "Team", score: 65, note: "Ex-Stripe founders, no domain expertise" },
      { key: "traction", label: "Traction", score: 41, note: "Pre-revenue, design partners only" },
    ],
    triageRationale:
      "Mixed signals — fit hits 3/4 axes but check-size exceeds policy. Worth a 5-minute review.",
  },
  {
    id: "seed-2",
    companyName: "Beta Labs",
    industry: "Devtools",
    verdict: "advance",
    submittedAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    fit: {
      geography: { status: "match", note: "Berlin matches EU thesis" },
      stage: { status: "match", note: "Seed-stage" },
      sector: { status: "match", note: "Devtools aligned" },
      checkSize: { status: "match", note: "$1.5M within range" },
      overall: 88,
      rationale: "Clean fit across all four axes.",
    },
    lensScores: [
      { key: "market", label: "Market", score: 82 },
      { key: "team", label: "Team", score: 84 },
      { key: "traction", label: "Traction", score: 79 },
    ],
    triageRationale:
      "Clean across the board — no flags. Advanced automatically to DD.",
  },
  {
    id: "seed-3",
    companyName: "Delta Co",
    industry: "Climate hardware",
    verdict: "review",
    submittedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    fit: {
      geography: { status: "match", note: "US-based" },
      stage: { status: "match", note: "Seed-stage" },
      sector: { status: "borderline", note: "Hardware adjacent to thesis" },
      checkSize: { status: "match", note: "Within range" },
      overall: 74,
      rationale: "Sector is the open question.",
    },
    lensScores: [
      { key: "market", label: "Market", score: 70 },
      { key: "team", label: "Team", score: 72, note: "Strong climate operator" },
      { key: "traction", label: "Traction", score: 55, note: "Two pilot LOIs" },
    ],
    triageRationale:
      "Borderline on sector — adjacent but not core. Investor judgement needed.",
  },
  {
    id: "seed-4",
    companyName: "Gamma Inc",
    industry: "Crypto",
    verdict: "reject",
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    dealbreakerNote: "Crypto is in dealbreakers",
    fit: {
      geography: { status: "match", note: "US-based" },
      stage: { status: "match", note: "Seed" },
      sector: { status: "mismatch", note: "Crypto dealbreaker triggered" },
      checkSize: { status: "borderline", note: "Range unclear" },
      overall: 18,
      rationale: "Dealbreaker on sector.",
    },
    lensScores: [
      { key: "market", label: "Market", score: 40 },
      { key: "team", label: "Team", score: 55 },
      { key: "traction", label: "Traction", score: 30 },
    ],
    triageRationale: "Auto-rejected — dealbreaker on sector.",
  },
  {
    id: "seed-5",
    companyName: "Epsilon Health",
    industry: "Digital health",
    verdict: "reject",
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    dealbreakerNote: "Stage mismatch (pre-product)",
    fit: {
      geography: { status: "match", note: "US-based" },
      stage: { status: "mismatch", note: "Pre-product vs seed thesis" },
      sector: { status: "borderline", note: "Health-adjacent" },
      checkSize: { status: "borderline", note: "Below floor" },
      overall: 22,
      rationale: "Too early.",
    },
    lensScores: [
      { key: "market", label: "Market", score: 50 },
      { key: "team", label: "Team", score: 60 },
      { key: "traction", label: "Traction", score: 15 },
    ],
    triageRationale: "Auto-rejected — pre-product, below stage floor.",
  },
];

function ScreeningPage() {
  const queryClient = useQueryClient();
  const { data: backendRows, isLoading, error } = useQuery({
    queryKey: ["investor", "screening"],
    queryFn: fetchScreeningQueue,
    staleTime: 30_000,
  });

  const advanceMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean; startupId: string; verdict: "advance"; note: string }>(
        `/investor/screening/${startupId}/advance`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success("Advanced to Due Diligence", { description: res.note });
      queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
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
      queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
    },
    onError: (err) =>
      toast.error("Pass failed", { description: (err as Error).message }),
  });

  // Pessimistic local mirror so PASS/ADVANCE update the row immediately.
  // Source of truth is the backend; we patch verdict in-place on action.
  const sourceRows = useMemo<ScreeningRow[]>(() => {
    if (Array.isArray(backendRows) && backendRows.length > 0) {
      return backendRows.map(mapBackendRow);
    }
    return SEED_ROWS;
  }, [backendRows]);

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

  const [openId, setOpenId] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const usingPlaceholder =
    !isLoading && !error && (!backendRows || backendRows.length === 0);

  const { activeRows, rejectedRows, advancedRowIds } = useMemo(() => {
    const active = rows.filter((r) => r.verdict !== "reject");
    const rejected = rows.filter((r) => r.verdict === "reject");
    const advanced = new Set(
      rows.filter((r) => r.verdict === "advance").map((r) => r.id),
    );
    return { activeRows: active, rejectedRows: rejected, advancedRowIds: advanced };
  }, [rows]);

  const openRow = useCallback((id: string) => setOpenId(id), []);
  const closeModal = useCallback(() => setOpenId(null), []);

  const handlePass = useCallback(
    (id: string) => {
      // Optimistic local update; the mutation invalidates the query on
      // success so the server state replaces it.
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, verdict: "reject", dealbreakerNote: "Passed by investor" } : r,
        ),
      );
      setOpenId(null);
      passMutation.mutate(id);
    },
    [passMutation],
  );

  const handleAdvance = useCallback(
    (id: string) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, verdict: "advance" } : r)),
      );
      setOpenId(null);
      advanceMutation.mutate(id);
    },
    [advanceMutation],
  );

  const openDetail = useMemo<ScreeningDetail | null>(() => {
    if (!openId) return null;
    const row = rows.find((r) => r.id === openId);
    if (!row) return null;
    return {
      id: row.id,
      companyName: row.companyName,
      industry: row.industry,
      verdict: row.verdict,
      fit: row.fit,
      lensScores: row.lensScores,
      triageRationale: row.triageRationale,
    };
  }, [openId, rows]);

  return (
    <div className="flex flex-col gap-4 p-6">
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
              onOpen={openRow}
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
                  onOpen={openRow}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {usingPlaceholder && (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>No screened deals yet.</strong> Showing placeholder rows
          until the first triage decision lands. Submit a startup from{" "}
          <em>Analyze Startup</em> — once the pipeline finishes, the real
          row replaces these.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900">
          Failed to load screening queue: {(error as Error).message}
        </div>
      )}

      <ScreeningDetailModal
        detail={openDetail}
        open={!!openId}
        onOpenChange={(v) => !v && closeModal()}
        onPass={handlePass}
        onAdvance={handleAdvance}
      />
    </div>
  );
}

