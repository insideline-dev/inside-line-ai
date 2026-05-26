import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { ScreeningDealCard } from "@/components/investor/ScreeningDealCard";
import { ScreeningAdvanceDialog } from "@/components/investor/ScreeningAdvanceDialog";
import { ScreeningPassDialog } from "@/components/investor/ScreeningPassDialog";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ThesisFitOutput } from "@/types/thesis-fit";
import type {
  LensScore,
  ScreeningVerdict,
} from "@/components/investor/screening-types";

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

function fetchAdminScreeningQueue() {
  return customFetch<BackendScreeningRow[]>("/admin/screening");
}

interface ScreeningRow {
  id: string;
  companyName: string;
  industry?: string | null;
  stage?: string | null;
  website?: string | null;
  verdict: ScreeningVerdict;
  overallScore: number;
  submittedAt: string;
  dealbreakerNote?: string | null;
  fit: ThesisFitOutput;
  lensScores: LensScore[];
  triageRationale: string;
}

function mapBackendRow(b: BackendScreeningRow): ScreeningRow {
  const fit: ThesisFitOutput =
    b.fit ?? {
      geography: { status: "borderline", note: "Pending" },
      stage: { status: "borderline", note: "Pending" },
      sector: { status: "borderline", note: "Pending" },
      checkSize: { status: "borderline", note: "Pending" },
      overall: b.overallScore,
      rationale: b.triageRationale,
    };
  return {
    id: b.id,
    companyName: b.companyName,
    industry: b.industry,
    stage: b.stage,
    website: b.website,
    verdict: b.verdict,
    overallScore: b.overallScore,
    submittedAt: b.submittedAt,
    dealbreakerNote: b.dealbreakerNote,
    fit,
    lensScores: b.lensScores.map((l) => ({
      key: l.key,
      label: l.label,
      score: l.score,
      note: l.note,
    })),
    triageRationale: b.triageRationale,
  };
}

export const Route = createFileRoute("/_protected/admin/screening")({
  component: AdminScreeningPage,
});

interface ProcessingStartup {
  id: string;
  name: string;
  status: string;
  stage?: string;
  industry?: string;
  createdAt: string;
}

function AdminScreeningPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "screening"],
    queryFn: fetchAdminScreeningQueue,
    staleTime: 30_000,
  });

  const { data: allStartupsRaw } = useQuery({
    queryKey: ["admin", "screening", "processing"],
    queryFn: () =>
      customFetch<{ data: ProcessingStartup[] }>(
        "/admin/startups?limit=100&status=analyzing",
      ),
    staleTime: 10_000,
  });

  const invalidateStageQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["investor", "pipeline"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["startupController"] });
  };

  const advanceMutation = useMutation({
    mutationFn: ({ startupId, reasonTags, notes }: { startupId: string; reasonTags?: string[]; notes?: string }) =>
      customFetch<{ ok: boolean; startupId: string; verdict: "advance"; note: string }>(
        `/investor/screening/${startupId}/advance`,
        { method: "POST", body: JSON.stringify({ reasonTags, notes }) },
      ),
    onSuccess: (res) => {
      toast.success("Advanced to Due Diligence", { description: res.note });
      invalidateStageQueries();
    },
    onError: (err) =>
      toast.error("Advance failed", { description: (err as Error).message }),
  });

  const passMutation = useMutation({
    mutationFn: ({ startupId, reasonTags, notes }: { startupId: string; reasonTags?: string[]; notes?: string }) =>
      customFetch<{ ok: boolean; startupId: string; verdict: "reject" }>(
        `/investor/screening/${startupId}/pass`,
        { method: "POST", body: JSON.stringify({ reasonTags, notes }) },
      ),
    onSuccess: () => {
      toast.success("Marked as passed — moved to rejected archive.");
      invalidateStageQueries();
    },
    onError: (err) =>
      toast.error("Pass failed", { description: (err as Error).message }),
  });

  const rows = useMemo<ScreeningRow[]>(
    () => (Array.isArray(data) ? data.map(mapBackendRow) : []),
    [data],
  );
  const { activeRows, rejectedRows } = useMemo(() => {
    const active = rows.filter((r) => r.verdict === "review");
    const rejected = rows.filter((r) => r.verdict === "reject");
    return { activeRows: active, rejectedRows: rejected };
  }, [rows]);

  const processingStartups = useMemo(() => {
    const allStartups: ProcessingStartup[] =
      Array.isArray(allStartupsRaw) ? allStartupsRaw
        : (allStartupsRaw as { data?: ProcessingStartup[] } | undefined)?.data ?? [];
    const screenedIds = new Set(rows.map((r) => r.id));
    return allStartups.filter(
      (s) =>
        (s.status === "submitted" || s.status === "analyzing") &&
        !screenedIds.has(s.id),
    );
  }, [allStartupsRaw, rows]);

  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [passingId, setPassingId] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const handleAdvance = useCallback((id: string) => setAdvancingId(id), []);
  const handlePass = useCallback((id: string) => setPassingId(id), []);

  return (
    <div className="flex flex-col gap-4">
      <StageNav surface="admin" counts={{ screening: activeRows.length + processingStartups.length }} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Deal Screening (Admin)</h1>
        <span className="text-sm text-muted-foreground">
          Global screening dashboard — every deal in DS, regardless of owner.
        </span>
      </div>

      {processingStartups.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Processing ({processingStartups.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {processingStartups.map((s) => (
              <Card key={s.id} className="border-dashed">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Link
                        to="/admin/startup/$id"
                        params={{ id: s.id }}
                        className="text-sm font-semibold hover:underline truncate"
                      >
                        {s.name}
                      </Link>
                      <Badge variant="outline" className="gap-1 text-[11px] shrink-0">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing
                      </Badge>
                    </div>
                    <AnalysisProgressBar startupId={s.id} compact />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading screening queue…
        </div>
      ) : activeRows.length === 0 && processingStartups.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-6 text-sm text-muted-foreground">
          <Inbox className="h-4 w-4" />
          No deals currently in screening across the platform.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {activeRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-1">
              <ScreeningDealCard
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
                onPass={handlePass}
                onAdvance={handleAdvance}
                onOpen={(id) => { window.location.href = `/admin/screening/${id}`; }}
              />
              <Link
                to="/admin/screening/$id"
                params={{ id: row.id }}
                className="ml-auto text-xs text-primary hover:underline"
              >
                Open live pipeline →
              </Link>
            </div>
          ))}
        </div>
      )}

      {rejectedRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowRejected((v) => !v)}
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
                  onOpen={(id) => { window.location.href = `/admin/screening/${id}`; }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ScreeningAdvanceDialog
        open={advancingId !== null}
        onOpenChange={(open) => { if (!open) setAdvancingId(null); }}
        isSubmitting={advanceMutation.isPending}
        onSubmit={(input) => {
          if (!advancingId) return;
          advanceMutation.mutate({ startupId: advancingId, reasonTags: input.reasonTags, notes: input.notes });
          setAdvancingId(null);
        }}
      />

      <ScreeningPassDialog
        open={passingId !== null}
        onOpenChange={(open) => { if (!open) setPassingId(null); }}
        isSubmitting={passMutation.isPending}
        onSubmit={(input) => {
          if (!passingId) return;
          passMutation.mutate({ startupId: passingId, reasonTags: input.reasonTags, notes: input.notes });
          setPassingId(null);
        }}
      />
    </div>
  );
}
