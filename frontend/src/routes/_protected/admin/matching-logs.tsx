import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/DataTable";
import { customFetch } from "@/api/client";
import {
  Network,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/matching-logs")({
  component: MatchingLogsPage,
});

// ---------- Types ----------

interface MatchingJob {
  id: string;
  startupId: string;
  startupName: string;
  status: "pending" | "processing" | "completed" | "failed";
  triggerSource: string | null;
  candidatesEvaluated: number | null;
  matchesFound: number | null;
  failedCandidates: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface InvestorEvaluation {
  matchId: string;
  investorId: string;
  investorName: string;
  investorEmail: string;
  thesisFitScore: number | null;
  thesisFitFallback: boolean | null;
  fitRationale: string | null;
  overallScore: number;
  marketScore: number | null;
  teamScore: number | null;
  productScore: number | null;
  tractionScore: number | null;
  matchStatus: string;
  thresholdMet: boolean | null;
  thesisThreshold: number | null;
  startupScoreThreshold: number | null;
  createdAt: string;
}

interface JobDetail {
  job: {
    id: string;
    startupId: string;
    status: string;
    triggerSource: string | null;
    candidatesEvaluated: number | null;
    matchesFound: number | null;
    failedCandidates: number | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  investors: InvestorEvaluation[];
}

// ---------- Helpers ----------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    completed: { label: "Completed", variant: "default" },
    processing: { label: "Processing", variant: "secondary" },
    pending: { label: "Pending", variant: "outline" },
    failed: { label: "Failed", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function TriggerBadge({ source }: { source: string | null }) {
  if (!source) return <span className="text-muted-foreground text-xs">—</span>;
  const labels: Record<string, string> = {
    approval: "Approval",
    manual: "Manual",
    retry: "Retry",
    pipeline_completion: "Pipeline",
    thesis_update: "Thesis Update",
  };
  return (
    <Badge variant="outline" className="text-xs font-normal">
      {labels[source] ?? source}
    </Badge>
  );
}

function ScoreBar({ score, threshold }: { score: number | null; threshold: number | null }) {
  if (score === null) return <span className="text-muted-foreground text-xs">N/A</span>;
  const met = threshold !== null ? score >= threshold : null;
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <Progress
        value={score}
        className="h-1.5 flex-1"
      />
      <span className={`text-xs font-medium tabular-nums w-7 text-right ${met === false ? "text-destructive" : met === true ? "text-green-600" : ""}`}>
        {score}
      </span>
    </div>
  );
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m ${s % 60}s`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------- Hooks ----------

function useMatchingLogs(page: number) {
  return useQuery({
    queryKey: ["admin", "matching-logs", page],
    queryFn: () =>
      customFetch<MatchingJob[]>(`/admin/matching-logs?page=${page}&limit=50`),
  });
}

function useJobInvestors(jobId: string | null) {
  return useQuery({
    queryKey: ["admin", "matching-logs", jobId, "investors"],
    queryFn: () =>
      customFetch<JobDetail>(`/admin/matching-logs/${jobId}/investors`),
    enabled: !!jobId,
  });
}

// ---------- Columns ----------

type JobColumn = { header: string; accessor?: keyof MatchingJob; cell?: (row: MatchingJob) => React.ReactNode };

function buildColumns(onSelect: (job: MatchingJob) => void): JobColumn[] {
  return [
    {
      header: "Startup",
      accessor: "startupName",
      cell: (row) => <span className="font-medium">{row.startupName}</span>,
    },
    {
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: "Trigger",
      cell: (row) => <TriggerBadge source={row.triggerSource} />,
    },
    {
      header: "Evaluated",
      cell: (row) => (
        <span className="tabular-nums">{row.candidatesEvaluated ?? "—"}</span>
      ),
    },
    {
      header: "Matched",
      cell: (row) => (
        <span className="tabular-nums text-green-600 font-medium">
          {row.matchesFound ?? "—"}
        </span>
      ),
    },
    {
      header: "Fallbacks",
      cell: (row) => {
        const n = row.failedCandidates;
        if (!n) return <span className="text-muted-foreground">0</span>;
        return <span className="text-amber-600 tabular-nums">{n}</span>;
      },
    },
    {
      header: "Duration",
      cell: (row) => (
        <span className="text-muted-foreground text-sm">
          {durationLabel(row.startedAt, row.completedAt)}
        </span>
      ),
    },
    {
      header: "Created",
      cell: (row) => (
        <span className="text-muted-foreground text-sm">
          {relativeTime(row.createdAt)}
        </span>
      ),
    },
    {
      header: "",
      cell: (row) => (
        <button
          onClick={() => onSelect(row)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View investors <ChevronRight className="h-3 w-3" />
        </button>
      ),
    },
  ];
}

// ---------- Investor Detail Sheet ----------

function InvestorDetailSheet({
  jobId,
  open,
  onClose,
}: {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useJobInvestors(jobId);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Investor Evaluations
          </SheetTitle>
          {data && (
            <SheetDescription className="flex flex-wrap gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs">
                <Users className="h-3 w-3" />
                {data.job.candidatesEvaluated ?? 0} evaluated
              </span>
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                {data.job.matchesFound ?? 0} matched
              </span>
              {(data.job.failedCandidates ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertCircle className="h-3 w-3" />
                  {data.job.failedCandidates} fallbacks
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {durationLabel(data.job.startedAt, data.job.completedAt)}
              </span>
            </SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          {isLoading && (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {data && data.investors.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No investor evaluations recorded yet.
            </div>
          )}

          {data && data.investors.length > 0 && (
            <div className="divide-y">
              {data.investors.map((inv) => (
                <div key={inv.matchId} className="px-6 py-4 space-y-3">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm leading-none">{inv.investorName}</p>
                      <p className="text-xs text-muted-foreground mt-1">{inv.investorEmail}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inv.thesisFitFallback && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          Fallback
                        </Badge>
                      )}
                      {inv.thresholdMet === true && (
                        <Badge variant="default" className="text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Matched
                        </Badge>
                      )}
                      {inv.thresholdMet === false && (
                        <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                          <XCircle className="h-3 w-3" /> Below threshold
                        </Badge>
                      )}
                      {inv.thresholdMet === null && (
                        <Badge variant="secondary" className="text-xs">Evaluated</Badge>
                      )}
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">
                        Thesis fit
                        {inv.thesisThreshold !== null && (
                          <span className="ml-1 opacity-60">({inv.thesisThreshold} min)</span>
                        )}
                      </span>
                      <ScoreBar score={inv.thesisFitScore} threshold={inv.thesisThreshold} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Overall</span>
                      <ScoreBar score={inv.overallScore} threshold={inv.startupScoreThreshold} />
                    </div>
                    {inv.marketScore !== null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Market</span>
                        <ScoreBar score={inv.marketScore} threshold={null} />
                      </div>
                    )}
                    {inv.teamScore !== null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Team</span>
                        <ScoreBar score={inv.teamScore} threshold={null} />
                      </div>
                    )}
                    {inv.productScore !== null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Product</span>
                        <ScoreBar score={inv.productScore} threshold={null} />
                      </div>
                    )}
                    {inv.tractionScore !== null && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Traction</span>
                        <ScoreBar score={inv.tractionScore} threshold={null} />
                      </div>
                    )}
                  </div>

                  {/* Rationale */}
                  {inv.fitRationale && (
                    <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
                      {inv.fitRationale}
                    </p>
                  )}

                  <Separator className="mt-1" />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Page ----------

function MatchingLogsPage() {
  const [selectedJob, setSelectedJob] = useState<MatchingJob | null>(null);
  const { data, isLoading } = useMatchingLogs(1);

  const jobs = Array.isArray(data) ? data : [];

  const columns = buildColumns((job) => setSelectedJob(job));

  const totalEvaluated = jobs.reduce((s, j) => s + (j.candidatesEvaluated ?? 0), 0);
  const totalMatched = jobs.reduce((s, j) => s + (j.matchesFound ?? 0), 0);
  const failedJobs = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Network className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">Matching Logs</h1>
          <p className="text-sm text-muted-foreground">
            All investor thesis alignment jobs — matched and unmatched
          </p>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && jobs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Runs</p>
            <p className="text-2xl font-semibold tabular-nums">{jobs.length}</p>
          </div>
          <div className="border p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Investors Evaluated</p>
            <p className="text-2xl font-semibold tabular-nums">{totalEvaluated}</p>
            <p className="text-xs text-green-600">{totalMatched} matched</p>
          </div>
          <div className="border p-4 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Failed Runs</p>
            <p className={`text-2xl font-semibold tabular-nums ${failedJobs > 0 ? "text-destructive" : ""}`}>
              {failedJobs}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <DataTable columns={columns} data={jobs} />
      )}

      {/* Investor Detail Sheet */}
      <InvestorDetailSheet
        jobId={selectedJob?.id ?? null}
        open={!!selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
