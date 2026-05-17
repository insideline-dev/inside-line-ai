import { useCallback, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { customFetch } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FitChips } from "@/components/investor/FitChips";
import { StartupFavicon } from "@/components/investor/StartupFavicon";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { ScreeningPitchDeckViewer } from "@/components/investor/ScreeningPitchDeckViewer";
import { formatIndustry } from "@/lib/kpi-metrics";
import { cn } from "@/lib/utils";
import type { ScreeningRow, ScreeningVerdict, LensScore } from "@/components/investor/screening-types";
import type { FitStatus, ThesisFitOutput } from "@/types/thesis-fit";

function fetchScreeningQueue() {
  return customFetch<ScreeningRow[]>("/investor/screening");
}

export const Route = createFileRoute("/_protected/investor/screening_/$id")({
  component: ScreeningDetailPage,
});

const VERDICT_BADGE: Record<
  ScreeningVerdict,
  { label: string; className: string }
> = {
  review: {
    label: "REVIEW",
    className: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  },
  advance: {
    label: "ADVANCE",
    className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  },
  reject: {
    label: "REJECT",
    className: "bg-red-100 text-red-900 hover:bg-red-100",
  },
};

const STATUS_ICON: Record<FitStatus, React.ElementType> = {
  match: CheckCircle2,
  borderline: AlertCircle,
  mismatch: XCircle,
};

const STATUS_COLOR: Record<FitStatus, string> = {
  match: "text-emerald-600",
  borderline: "text-amber-600",
  mismatch: "text-red-600",
};

function FitTable({ fit }: { fit: ThesisFitOutput }) {
  const rows = (
    [
      ["geography", "Geography"],
      ["stage", "Stage"],
      ["sector", "Sector"],
      ["checkSize", "Check size"],
    ] as const
  ).map(([key, label]) => ({ key, label, axis: fit[key] }));

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {rows.map(({ key, label, axis }) => {
        const Icon = STATUS_ICON[axis.status];
        return (
          <div
            key={key}
            className="flex items-start gap-3 border-b border-border px-3 py-2 last:border-b-0"
          >
            <Icon
              className={cn("mt-0.5 h-4 w-4 shrink-0", STATUS_COLOR[axis.status])}
            />
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{label}</span>
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wide",
                    STATUS_COLOR[axis.status],
                  )}
                >
                  {axis.status}
                </span>
              </div>
              {axis.note && (
                <div className="text-xs text-muted-foreground">{axis.note}</div>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm">
        <span className="font-medium">Overall fit</span>
        <span className="font-semibold">{fit.overall} / 100</span>
      </div>
    </div>
  );
}

function LensWriteup({ lens }: { lens: LensScore }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScoreRing score={lens.score} size="sm" showLabel={false} colorText />
            <div>
              <div className="text-sm font-semibold">{lens.label}</div>
              {lens.signal && (
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {lens.signal}
                </div>
              )}
            </div>
          </div>
          <span className="text-xl font-bold tabular-nums">{lens.score}</span>
        </div>
        {lens.rationale ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {lens.rationale}
          </p>
        ) : lens.note ? (
          <p className="text-sm text-muted-foreground">{lens.note}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No rationale recorded for this lens.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatMoney(n: number | null): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function ScreeningDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["investor", "screening"],
    queryFn: fetchScreeningQueue,
    staleTime: 30_000,
  });

  const row = useMemo(() => rows?.find((r) => r.id === id) ?? null, [rows, id]);

  const invalidateAndBack = () => {
    queryClient.invalidateQueries({ queryKey: ["investor", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["investor", "pipeline"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "screening"] });
    queryClient.invalidateQueries({ queryKey: ["startupController"] });
    void navigate({ to: "/investor/screening" });
  };

  const advanceMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean; note: string }>(
        `/investor/screening/${startupId}/advance`,
        { method: "POST" },
      ),
    onSuccess: (res) => {
      toast.success("Advanced to Due Diligence", { description: res.note });
      invalidateAndBack();
    },
    onError: (err) =>
      toast.error("Advance failed", { description: (err as Error).message }),
  });

  const passMutation = useMutation({
    mutationFn: (startupId: string) =>
      customFetch<{ ok: boolean }>(`/investor/screening/${startupId}/pass`, {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success("Marked as passed — moved to rejected archive.");
      invalidateAndBack();
    },
    onError: (err) =>
      toast.error("Pass failed", { description: (err as Error).message }),
  });

  const handlePass = useCallback(() => {
    if (!row) return;
    passMutation.mutate(row.id);
  }, [row, passMutation]);

  const handleAdvance = useCallback(() => {
    if (!row) return;
    advanceMutation.mutate(row.id);
  }, [row, advanceMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        Failed to load screening detail: {(error as Error).message}
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <h2 className="text-xl font-semibold">Screening row not found</h2>
        <p className="text-sm text-muted-foreground">
          This deal may have been advanced or rejected.
        </p>
        <Button asChild>
          <Link to="/investor/screening">Back to Screening</Link>
        </Button>
      </div>
    );
  }

  const verdictCfg = VERDICT_BADGE[row.verdict];
  const canAct = row.verdict === "review";
  const fundingLabel = formatMoney(row.fundingTarget);
  const mutating = advanceMutation.isPending || passMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild size="sm" variant="ghost" className="mt-1 -ml-2">
            <Link to="/investor/screening" aria-label="Back to Screening">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <StartupFavicon name={row.companyName} website={row.website} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold leading-tight">
                {row.companyName}
              </h1>
              <Badge variant="secondary" className={verdictCfg.className}>
                {verdictCfg.label}
              </Badge>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {row.industry && (
                <Badge variant="secondary">{formatIndustry(row.industry)}</Badge>
              )}
              {row.stage && (
                <Badge variant="outline" className="capitalize">
                  {row.stage.replace(/_/g, " ")}
                </Badge>
              )}
              {row.location && (
                <span className="text-muted-foreground">· {row.location}</span>
              )}
              {fundingLabel && (
                <span className="text-muted-foreground">
                  · raising {fundingLabel}
                </span>
              )}
              {row.website && (
                <a
                  href={row.website.startsWith("http") ? row.website : `https://${row.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                >
                  · website
                </a>
              )}
              <span className="text-muted-foreground">
                · submitted{" "}
                {formatDistanceToNow(new Date(row.submittedAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        </div>

        {canAct && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={handlePass}
              disabled={mutating}
              data-testid="screening-page-pass"
            >
              <X className="mr-1 h-4 w-4" />
              Pass
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleAdvance}
              disabled={mutating}
              data-testid="screening-page-advance"
            >
              <Check className="mr-1 h-4 w-4" />
              Advance to DD
            </Button>
          </div>
        )}
      </div>

      {row.dealbreakerNote && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {row.dealbreakerNote}
        </div>
      )}

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Left: rich write-ups */}
        <div className="flex flex-col gap-4">
          {/* Thesis-fit summary */}
          {row.fit?.rationale && (
            <section
              className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-4"
              data-testid="screening-thesis-summary"
            >
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Thesis fit summary
              </h3>
              <p className="text-sm leading-relaxed">{row.fit.rationale}</p>
            </section>
          )}

          {/* Per-axis fit */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Thesis fit — per axis
            </h3>
            {row.fit ? (
              <>
                <FitChips fit={row.fit} />
                <FitTable fit={row.fit} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Fit assessment pending.
              </p>
            )}
          </section>

          {/* Lens write-ups */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Lens write-ups
            </h3>
            <div className="flex flex-col gap-2">
              {row.lensScores.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lens results recorded yet.
                </p>
              ) : (
                row.lensScores.map((lens) => (
                  <LensWriteup key={lens.key} lens={lens} />
                ))
              )}
            </div>
          </section>

          {/* Triage rationale */}
          {row.triageRationale && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Triage rationale
              </h3>
              <Card>
                <CardContent className="p-4 text-sm">
                  {row.triageRationale}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Company description */}
          {row.description && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Company description
              </h3>
              <Card>
                <CardContent className="p-4 text-sm leading-relaxed text-foreground/90">
                  {row.description}
                </CardContent>
              </Card>
            </section>
          )}
        </div>

        {/* Right: pitch deck viewer */}
        <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Pitch deck
          </h3>
          <ScreeningPitchDeckViewer url={row.pitchDeckUrl} />
        </div>
      </div>
    </div>
  );
}
