import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { customFetch } from "@/api/client";
import { StageNav } from "@/components/investor/StageNav";
import { ScreeningDealCard } from "@/components/investor/ScreeningDealCard";
import type { ThesisFitOutput } from "@/types/thesis-fit";
import type {
  LensScore,
  ScreeningVerdict,
} from "@/components/investor/ScreeningDetailModal";

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

function AdminScreeningPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "screening"],
    queryFn: fetchAdminScreeningQueue,
    staleTime: 30_000,
  });
  const rows = useMemo<ScreeningRow[]>(
    () => (Array.isArray(data) ? data.map(mapBackendRow) : []),
    [data],
  );
  const { activeRows, rejectedRows } = useMemo(() => {
    // Show only REVIEW in the active queue; ADVANCED deals belong on
    // the DD tab. REJECTED deals live in the collapsed archive.
    const active = rows.filter((r) => r.verdict === "review");
    const rejected = rows.filter((r) => r.verdict === "reject");
    return { activeRows: active, rejectedRows: rejected };
  }, [rows]);

  const [showRejected, setShowRejected] = useState(false);

  // Admin click → live pipeline view for that startup
  const openLivePipeline = (id: string) => {
    // Navigate via window.location since we're outside a single Link click.
    // Could also use TanStack Router programmatically.
    window.location.href = `/admin/screening/${id}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <StageNav surface="admin" counts={{ screening: activeRows.length }} />

      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Deal Screening (Admin)</h1>
        <span className="text-sm text-muted-foreground">
          Global screening dashboard — every deal in DS, regardless of owner.
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
                onOpen={openLivePipeline}
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
                  onOpen={openLivePipeline}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
