import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FitChips } from "@/components/investor/FitChips";
import { StartupFavicon } from "@/components/investor/StartupFavicon";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { ScreeningPitchDeckViewer } from "@/components/investor/ScreeningPitchDeckViewer";
import { formatIndustry } from "@/lib/kpi-metrics";
import { cn } from "@/lib/utils";
import type {
  LensScore,
  ScreeningRow,
  ScreeningVerdict,
} from "@/components/investor/screening-types";
import type {
  ScreeningEvidence,
  ScreeningLensV1,
  ScreeningOutputV1,
} from "@/lib/screening/useScreeningOutput";
import type { FitStatus, ThesisFitOutput } from "@/types/thesis-fit";

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

function EvidenceSourceLabel({ evidence }: { evidence: ScreeningEvidence }) {
  const label =
    evidence.sourceType === "deck_page" && evidence.pageNumber
      ? `Pitch deck • page ${evidence.pageNumber}`
      : evidence.sourceLabel ?? evidence.sourceRef ?? evidence.source ?? null;

  if (!label) return null;

  return (
    <span className="text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

function LensEvidenceClaim({
  evidence,
  onDeckPageSelect,
}: {
  evidence: ScreeningEvidence;
  onDeckPageSelect: (pageNumber: number) => void;
}) {
  const href = evidence.url ?? evidence.source;

  if (
    evidence.sourceType === "deck_page" &&
    typeof evidence.pageNumber === "number"
  ) {
    return (
      <button
        type="button"
        className="text-left text-sm leading-relaxed text-foreground hover:underline"
        onClick={() => onDeckPageSelect(evidence.pageNumber!)}
      >
        {evidence.claim}
      </button>
    );
  }

  if (href && /^https?:\/\//.test(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-start gap-1 text-sm leading-relaxed text-foreground hover:underline"
      >
        <span>{evidence.claim}</span>
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
      </a>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left text-sm leading-relaxed text-foreground hover:underline"
        >
          {evidence.claim}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">{evidence.claim}</div>
          <EvidenceSourceLabel evidence={evidence} />
          {evidence.quote && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {evidence.quote}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LensWriteup({
  lens,
  detail,
  onDeckPageSelect,
}: {
  lens: LensScore;
  detail?: ScreeningLensV1;
  onDeckPageSelect: (pageNumber: number) => void;
}) {
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
        {detail && detail.evidence.length > 0 && (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source-linked claims
            </div>
            <ul className="space-y-2">
              {detail.evidence.map((evidence, idx) => (
                <li key={`${detail.key}-${idx}`} className="space-y-1">
                  <LensEvidenceClaim
                    evidence={evidence}
                    onDeckPageSelect={onDeckPageSelect}
                  />
                  <EvidenceSourceLabel evidence={evidence} />
                </li>
              ))}
            </ul>
          </div>
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

interface ScreeningDetailHeaderProps {
  row: ScreeningRow;
  /** Where the back-arrow points. */
  backTo: string;
  /** When omitted, the Pass/Advance buttons are hidden. */
  onPass?: () => void;
  onAdvance?: () => void;
  /** Disables Pass/Advance while a mutation is pending. */
  busy?: boolean;
  /** Extra buttons rendered to the right of Pass/Advance (e.g. Re-run, Cancel pipeline). */
  extraActions?: React.ReactNode;
}

export function ScreeningDetailHeader({
  row,
  backTo,
  onPass,
  onAdvance,
  busy,
  extraActions,
}: ScreeningDetailHeaderProps) {
  const verdictCfg = VERDICT_BADGE[row.verdict];
  const canAct = row.verdict === "review";
  const fundingLabel = formatMoney(row.fundingTarget);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild size="sm" variant="ghost" className="mt-1 -ml-2">
            <Link to={backTo} aria-label="Back to Screening">
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
                  href={
                    row.website.startsWith("http")
                      ? row.website
                      : `https://${row.website}`
                  }
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

        <div className="flex shrink-0 items-center gap-2">
          {canAct && onPass && (
            <Button
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              onClick={onPass}
              disabled={busy}
              data-testid="screening-page-pass"
            >
              <X className="mr-1 h-4 w-4" />
              Pass
            </Button>
          )}
          {canAct && onAdvance && (
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={onAdvance}
              disabled={busy}
              data-testid="screening-page-advance"
            >
              <Check className="mr-1 h-4 w-4" />
              Advance to DD
            </Button>
          )}
          {extraActions}
        </div>
      </div>

      {row.dealbreakerNote && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {row.dealbreakerNote}
        </div>
      )}
    </>
  );
}

export function ScreeningDetailBody({
  row,
  screeningOutput,
}: {
  row: ScreeningRow;
  screeningOutput?: ScreeningOutputV1 | null;
}) {
  const [deckPage, setDeckPage] = useState(1);
  const lensDetails = useMemo(
    () => new Map((screeningOutput?.lenses ?? []).map((lens) => [lens.key, lens])),
    [screeningOutput],
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Left: rich write-ups */}
      <div className="flex flex-col gap-4">
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
                <LensWriteup
                  key={lens.key}
                  lens={lens}
                  detail={lensDetails.get(lens.key)}
                  onDeckPageSelect={setDeckPage}
                />
              ))
            )}
          </div>
        </section>

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

      <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Pitch deck
        </h3>
        <ScreeningPitchDeckViewer
          url={row.pitchDeckUrl}
          pageIndex={deckPage}
          onPageChange={setDeckPage}
        />
      </div>
    </div>
  );
}
