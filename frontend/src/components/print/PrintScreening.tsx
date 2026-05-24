import { AlertTriangle, CheckCircle2, AlertCircle, XCircle, CircleHelp, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { cn } from "@/lib/utils";
import { PrintLayout, PrintCover, PrintPage } from "./PrintLayout";
import type { Startup } from "@/types/startup";
import type { FitAxis, FitStatus, ThesisFitOutput } from "@/types/thesis-fit";
import type {
  ScreeningEvidence,
  ScreeningHandoffIssueV1,
  ScreeningLensV1,
  ScreeningOutputV1,
} from "@/lib/screening/useScreeningOutput";

interface PrintScreeningProps {
  startup: Startup;
  output: ScreeningOutputV1;
  ready: boolean;
  generatedBy?: string | null;
}

// ---------------------------------------------------------------------------
// Verdict config
// ---------------------------------------------------------------------------

type Verdict = ScreeningOutputV1["overall"]["signal"];

const VERDICT_BADGE: Record<Verdict, { label: string; className: string }> = {
  advance: {
    label: "ADVANCE",
    className: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  },
  review: {
    label: "REVIEW",
    className: "bg-amber-100 text-amber-900 hover:bg-amber-100",
  },
  reject: {
    label: "REJECT",
    className: "bg-red-100 text-red-900 hover:bg-red-100",
  },
};

// ---------------------------------------------------------------------------
// Fit table helpers (mirrored from ScreeningDetail.tsx)
// ---------------------------------------------------------------------------

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

const FIT_AXES = [
  ["geography", "Geography"],
  ["stage", "Stage"],
  ["sector", "Sector"],
  ["checkSize", "Check size"],
] as const;

const AXIS_CHIP_LABEL: Record<string, string> = {
  geography: "geo",
  stage: "stage",
  sector: "sector",
  checkSize: "check",
};

const MISSING_MATERIAL_LABELS: Record<string, string> = {
  deck: "Pitch deck",
  product_description: "Product description",
  team: "Team info",
  deal_terms: "Deal terms",
  website: "Website",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function parseThesisFit(raw: unknown): ThesisFitOutput | null {
  if (!isRecord(raw)) return null;
  const axes = ["geography", "stage", "sector", "checkSize"] as const;
  for (const key of axes) {
    const axis = raw[key];
    if (!isRecord(axis) || typeof axis.status !== "string") return null;
    if (typeof axis.note !== "string") {
      (axis as Record<string, unknown>).note = "";
    }
  }
  if (typeof raw.overall !== "number") return null;
  if (typeof raw.rationale !== "string") {
    (raw as Record<string, unknown>).rationale = "";
  }
  return raw as unknown as ThesisFitOutput;
}

interface PrintLens {
  key: string;
  label: string;
  score: number;
  signal: string;
  rationale?: string;
  detail?: ScreeningLensV1;
}

function lensLabel(key: string): string {
  if (key.length === 0) return key;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ");
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildLenses(output: ScreeningOutputV1): PrintLens[] {
  const detailMap = new Map(output.lenses.map((l) => [l.key, l]));
  const v2 = output.lensScores ?? [];

  if (v2.length > 0) {
    return v2.map((ls) => ({
      key: ls.key,
      label: lensLabel(ls.key),
      score: clamp(ls.score),
      signal: ls.signal,
      rationale: ls.rationale ?? detailMap.get(ls.key)?.rationale,
      detail: detailMap.get(ls.key),
    }));
  }

  return output.lenses.map((l) => ({
    key: l.key,
    label: lensLabel(l.key),
    score: clamp(l.score),
    signal: l.signal,
    rationale: l.rationale,
    detail: l,
  }));
}

function confidenceLabel(c?: string | null): string {
  if (!c) return "";
  return `${c.charAt(0).toUpperCase()}${c.slice(1)} confidence`;
}

// ---------------------------------------------------------------------------
// Sub-components (print-safe, no interactivity)
// ---------------------------------------------------------------------------

function FitChipsPrint({ fit }: { fit: ThesisFitOutput }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(Object.keys(AXIS_CHIP_LABEL) as Array<keyof typeof AXIS_CHIP_LABEL>).map((axisKey) => {
        const axis = fit[axisKey as keyof ThesisFitOutput] as FitAxis;
        const Icon = STATUS_ICON[axis.status];
        return (
          <span
            key={axisKey}
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-xs",
              STATUS_COLOR[axis.status],
            )}
          >
            <Icon className="h-3 w-3" />
            {AXIS_CHIP_LABEL[axisKey]}
          </span>
        );
      })}
      <span className="ml-1 text-xs font-medium text-muted-foreground">
        {fit.overall}
      </span>
    </div>
  );
}

function FitTablePrint({ fit }: { fit: ThesisFitOutput }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      {FIT_AXES.map(([key, label]) => {
        const axis = fit[key];
        const Icon = STATUS_ICON[axis.status];
        return (
          <div
            key={key}
            className="flex items-start gap-3 border-b border-border px-3 py-2 last:border-b-0"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", STATUS_COLOR[axis.status])} />
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
  return <span className="text-[11px] text-muted-foreground">{label}</span>;
}

function LensWriteupPrint({ lens }: { lens: PrintLens }) {
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
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No rationale recorded for this lens.
          </p>
        )}

        {lens.detail && lens.detail.evidence.length > 0 && (
          <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Source-linked claims
            </div>
            <ul className="space-y-2">
              {lens.detail.evidence.map((ev, idx) => (
                <li key={`${lens.key}-ev-${idx}`} className="space-y-1">
                  <span className="text-sm leading-relaxed text-foreground">
                    {ev.claim}
                  </span>
                  <EvidenceSourceLabel evidence={ev} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MissingMaterialsBanner({ materials }: { materials: string[] }) {
  if (materials.length === 0) return null;
  return (
    <div className="print-section rounded-md border border-sky-300/60 bg-sky-50 px-4 py-3 text-xs text-sky-900">
      <div className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Missing materials
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {materials.map((code) => (
          <Badge
            key={code}
            variant="outline"
            className="border-sky-400 bg-white text-[10px] text-sky-900"
          >
            {MISSING_MATERIAL_LABELS[code] ?? code}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function OpenIssuesPrint({ issues }: { issues: ScreeningHandoffIssueV1[] }) {
  if (issues.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <CircleHelp className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Open questions
        </h3>
        <Badge variant="secondary">{issues.length} open</Badge>
      </div>
      <div className="space-y-3">
        {issues.map((issue) => (
          <Card key={issue.key}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-base font-medium">{issue.label}</span>
                <Badge variant="outline" className="text-xs">
                  {issue.source === "screening-output"
                    ? "screening seed"
                    : "triage decision"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{issue.summary}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PrintScreening({
  startup,
  output,
  ready,
  generatedBy,
}: PrintScreeningProps) {
  const fit = parseThesisFit(output.thesisFit);
  const lenses = buildLenses(output);
  const verdictCfg = VERDICT_BADGE[output.overall.signal];
  const overallAny = output.overall as unknown as Record<string, unknown>;
  const triageRationale =
    (typeof overallAny.triageRationale === "string" ? overallAny.triageRationale : null) ??
    (typeof overallAny.reasoning === "string" ? overallAny.reasoning : null);
  const openIssues = output.handoff?.openIssues ?? [];
  const missingMaterials = output.overall.missingMaterials ?? [];

  return (
    <PrintLayout ready={ready}>
      {/* Page 1: Cover */}
      <PrintCover
        title="Screening Report"
        startupName={startup.name}
        stage={startup.stage}
        generatedAt={new Date(output.generatedAt)}
        subtitle={startup.description ?? undefined}
        generatedBy={generatedBy}
        score={output.overall.score}
        logoUrl={startup.logoUrl ?? undefined}
      />

      {/* Page 2+: Content */}
      <PrintPage>
        <div className="flex flex-col gap-5">
          {/* Verdict + Confidence */}
          <div className="print-section flex items-center gap-3">
            <Badge variant="secondary" className={verdictCfg.className}>
              {verdictCfg.label}
            </Badge>
            {output.overall.confidence && (
              <span className="text-xs text-muted-foreground">
                {confidenceLabel(output.overall.confidence)}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Score: {clamp(output.overall.score)} / 100
            </span>
          </div>

          {/* Missing Materials */}
          <MissingMaterialsBanner materials={missingMaterials} />

          {/* Thesis Fit Summary */}
          {fit?.rationale && fit.rationale.length > 0 && (
            <section className="print-section flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Thesis fit summary
              </h3>
              <p className="text-sm leading-relaxed">{fit.rationale}</p>
            </section>
          )}

          {/* Thesis Fit — Per Axis */}
          <section className="print-section flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Thesis fit — per axis
            </h3>
            {fit ? (
              <>
                <FitChipsPrint fit={fit} />
                <FitTablePrint fit={fit} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Fit assessment not available.
              </p>
            )}
          </section>

          {/* Lens Write-ups */}
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Lens write-ups
            </h3>
            <div className="flex flex-col gap-2">
              {lenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lens results recorded yet.
                </p>
              ) : (
                lenses.map((lens) => (
                  <div key={lens.key} className="print-break-inside-avoid">
                    <LensWriteupPrint lens={lens} />
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Open Questions */}
          <OpenIssuesPrint issues={openIssues} />

          {/* Triage Rationale */}
          {triageRationale && (
            <section className="print-section flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Triage rationale
              </h3>
              <Card>
                <CardContent className="p-4 text-sm">
                  {triageRationale}
                </CardContent>
              </Card>
            </section>
          )}

          {/* Company Description */}
          {startup.description && (
            <section className="print-section flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                Company description
              </h3>
              <Card>
                <CardContent className="p-4 text-sm leading-relaxed text-foreground/90">
                  {startup.description}
                </CardContent>
              </Card>
            </section>
          )}
        </div>
      </PrintPage>
    </PrintLayout>
  );
}
