import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { CheckCircle2, AlertTriangle, ChevronRight, Sparkles, TrendingUp, ArrowRight } from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation, ExitScenario, FounderReport } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";
import {
  getDisplayOverallScore,
  getDisplayPercentileRank,
  getDisplayRisks,
  getDisplaySectionScore,
  getDisplayStrengths,
} from "@/lib/evaluation-display";

interface AdminSummaryTabProps {
  startup: Startup;
  evaluation?: Evaluation;
  weights?: ScoringWeights | null;
}

interface SectionScoreRow {
  id: string;
  label: string;
  score: number;
  weight: number;
}

const EXIT_SCENARIO_DISPLAY_ORDER = {
  conservative: 0,
  moderate: 1,
  optimistic: 2,
} as const;

function formatCompactCurrency(value?: number | null): string {
  if (value == null) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function formatStage(value?: string | null): string {
  if (!value) return "N/A";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRaiseType(value?: string | null): string {
  if (!value) return "N/A";
  return value
    .split("_")
    .map((part) => part.toUpperCase() === "SAFE" ? "SAFE" : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoic(value: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}X`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function scoreBarClass(score: number): string {
  if (score >= 85) return "bg-fuchsia-500";
  if (score >= 70) return "bg-violet-600";
  if (score >= 55) return "bg-indigo-600";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function getSectionRows(evaluation: Evaluation, weights?: ScoringWeights | null): SectionScoreRow[] {
  return [
    { id: "team", label: "Team", score: getDisplaySectionScore(evaluation, "team") ?? 0, weight: weights?.team ?? 0 },
    { id: "market", label: "Market", score: getDisplaySectionScore(evaluation, "market") ?? 0, weight: weights?.market ?? 0 },
    { id: "product", label: "Product", score: getDisplaySectionScore(evaluation, "product") ?? 0, weight: weights?.product ?? 0 },
    { id: "traction", label: "Traction", score: getDisplaySectionScore(evaluation, "traction") ?? 0, weight: weights?.traction ?? 0 },
    { id: "businessModel", label: "Business Model", score: getDisplaySectionScore(evaluation, "businessModel") ?? 0, weight: weights?.businessModel ?? 0 },
    { id: "gtm", label: "GTM", score: getDisplaySectionScore(evaluation, "gtm") ?? 0, weight: weights?.gtm ?? 0 },
    {
      id: "competitiveAdvantage",
      label: "Competitive Advantage",
      score: getDisplaySectionScore(evaluation, "competitiveAdvantage") ?? 0,
      weight: weights?.competitiveAdvantage ?? 0,
    },
    { id: "financials", label: "Financials", score: getDisplaySectionScore(evaluation, "financials") ?? 0, weight: weights?.financials ?? 0 },
    { id: "legal", label: "Legal", score: getDisplaySectionScore(evaluation, "legal") ?? 0, weight: weights?.legal ?? 0 },
    { id: "dealTerms", label: "Deal Terms", score: getDisplaySectionScore(evaluation, "dealTerms") ?? 0, weight: weights?.dealTerms ?? 0 },
    { id: "exitPotential", label: "Exit Potential", score: getDisplaySectionScore(evaluation, "exitPotential") ?? 0, weight: weights?.exitPotential ?? 0 },
  ];
}

function InfoMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm leading-tight font-medium break-words ${accent ? "text-violet-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export function AdminSummaryTab({
  startup,
  evaluation,
  weights,
}: AdminSummaryTabProps) {
  const score = getDisplayOverallScore(evaluation, startup.overallScore);
  const percentileRank = getDisplayPercentileRank(evaluation, startup.percentileRank);
  const percentile =
    percentileRank != null ? `Top ${Math.round(100 - percentileRank)}%` : "N/A";
  const strengths = getDisplayStrengths(evaluation);
  const risks = getDisplayRisks(evaluation);
  const sectionRows = evaluation ? getSectionRows(evaluation, weights) : [];
  const overallConfidence = evaluation?.confidenceScore ?? "unknown";
  const dealSnapshot =
    evaluation?.executiveSummary ||
    evaluation?.investorMemo?.executiveSummary ||
    startup.description ||
    "No summary generated yet.";
  const founderReportData = (evaluation?.founderReport ?? null) as FounderReport | null;
  const whatsWorking = founderReportData?.whatsWorking?.filter((s) => s.trim().length > 0) ?? [];
  const pathToInevitability = founderReportData?.pathToInevitability?.filter((s) => s.trim().length > 0) ?? [];
  const exitScenarioSource: ExitScenario[] =
    (evaluation?.exitScenarios as ExitScenario[] | undefined) ??
    ((evaluation?.exitPotentialData as Record<string, unknown> | undefined)?.exitScenarios as ExitScenario[] | undefined) ??
    [];
  const exitScenarios = [...exitScenarioSource].sort(
    (left, right) =>
      EXIT_SCENARIO_DISPLAY_ORDER[left.scenario] -
      EXIT_SCENARIO_DISPLAY_ORDER[right.scenario],
  );

  return (
    <div className="space-y-6">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/15 px-4 py-6">
                <ScoreRing score={score} size="lg" showLabel={false} variant="secondary" />
                <ConfidenceBadge
                  confidence={overallConfidence}
                  className="mt-3"
                  dataTestId="badge-overall-confidence"
                />
                <div className="mt-3 rounded-xl border bg-background px-3 py-1">
                  <p className="text-[13px] font-semibold">{percentile}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <InfoMetric label="Stage" value={formatStage(startup.stage)} />
                <InfoMetric label="Industry Group" value={startup.sectorIndustryGroup || "N/A"} />
                <InfoMetric label="Industry" value={startup.sectorIndustry || startup.industry || "N/A"} />
                <InfoMetric label="Location" value={startup.location || "N/A"} />
                <InfoMetric
                  label="Round Size"
                  value={formatCompactCurrency(startup.fundingTarget)}
                  accent
                />
                <InfoMetric
                  label="Valuation (Post-money)"
                  value={formatCompactCurrency(startup.valuation)}
                  accent
                />
                <InfoMetric label="Raise Type" value={formatRaiseType(startup.raiseType)} />
                <InfoMetric label="Lead Investor" value={startup.leadInvestorName || "No"} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/[0.04] border-primary/15">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Deal Snapshot
            </CardTitle>
            <p className="text-xs text-muted-foreground">Top highlights for a quick pitch</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{dealSnapshot}</p>
            {strengths.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {strengths.slice(0, 4).map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Exit Scenarios
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Return scenarios from exit potential analysis
            </p>
          </CardHeader>
          <CardContent>
            {exitScenarios.length > 0 ? (
              <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch">
                {exitScenarios.map((scenario, idx) => (
                  <div key={scenario.scenario} className="contents">
                    <div
                      className={`rounded-xl border px-4 py-4 ${
                        scenario.scenario === "optimistic"
                          ? "border-violet-200 bg-violet-50/60 dark:border-violet-900/50 dark:bg-violet-950/20"
                          : scenario.scenario === "moderate"
                            ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/50 dark:bg-indigo-950/20"
                            : "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {scenario.scenario}
                        </p>
                        <span className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          {scenario.exitType}
                        </span>
                      </div>
                      <div className="mt-5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          MOIC
                        </p>
                        <p className="mt-1 text-4xl font-bold tracking-tight">
                          {formatMoic(scenario.moic)}
                        </p>
                      </div>
                      <div className="mt-4 border-t border-border/60 pt-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          IRR
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {formatPercent(scenario.irr)}
                        </p>
                      </div>
                      <p className="mt-4 text-xs text-muted-foreground">
                        {scenario.exitValuation}
                        {scenario.timeline ? ` · ${scenario.timeline}` : ""}
                      </p>
                      {scenario.researchBasis && (
                        <p className="mt-2 text-[11px] leading-tight text-muted-foreground/70 italic">
                          {scenario.researchBasis}
                        </p>
                      )}
                    </div>
                    {idx < exitScenarios.length - 1 && (
                      <div className="hidden md:flex items-center justify-center px-2">
                        <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic text-center py-4">
                Exit scenarios will be available after re-analysis
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-primary/[0.04] border-primary/15">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Key Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {strengths.length === 0 && <li className="text-muted-foreground">No strengths available yet.</li>}
                {strengths.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-amber-50/70 border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Key Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {risks.length === 0 && <li className="text-muted-foreground">No risks available yet.</li>}
                {risks.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {evaluation && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Section Scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sectionRows.map((row) => (
                <div key={row.id} className="grid grid-cols-[95px_36px_minmax(0,1fr)_32px] items-center gap-3">
                  <span className="text-xs">{row.label}</span>
                  <span className="text-[11px] text-muted-foreground">{row.weight}%</span>
                  <div className="h-2.5 rounded-full bg-muted">
                    <div className={`h-full rounded-full ${scoreBarClass(row.score)}`} style={{ width: `${row.score}%` }} />
                  </div>
                  <span className="text-right text-xs font-medium">{Math.round(row.score)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Founder Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {founderReportData?.summary || "Founder report summary is not available yet."}
            </p>

            {whatsWorking.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  What&apos;s Working
                </div>
                <ul className="space-y-1.5">
                  {whatsWorking.map((item, index) => (
                    <li key={`w-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pathToInevitability.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-400">
                  <ArrowRight className="h-4 w-4" />
                  Path to Inevitability
                </div>
                <ul className="space-y-1.5">
                  {pathToInevitability.map((item, index) => (
                    <li key={`p-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {whatsWorking.length === 0 && pathToInevitability.length === 0 && !founderReportData?.summary && (
              <p className="text-sm text-muted-foreground">
                Founder report details are not available yet.
              </p>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
