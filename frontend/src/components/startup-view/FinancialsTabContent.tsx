import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { MarkdownText } from "@/components/MarkdownText";
import {
  PiggyBank,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Target,
  FileSpreadsheet,
  BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { Evaluation } from "@/types/evaluation";

interface FinancialsTabContentProps {
  evaluation: Evaluation | null;
  financialsWeight?: number;
}

type GenericRecord = Record<string, unknown>;

interface SubScoreItem {
  dimension: string;
  weight: number;
  score: number;
}

function toRecord(value: unknown): GenericRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as GenericRecord;
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((s) => s.replace(/^[\s\-*•]+/, "").trim())
      .filter((s) => s.length > 0);
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y"].includes(normalized)) return true;
  if (["false", "no", "n"].includes(normalized)) return false;
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[$,%\s,]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toSubScores(value: unknown): SubScoreItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): SubScoreItem | null => {
      const record = toRecord(item);
      const dimension = toString(record.dimension);
      const weight = toNumber(record.weight);
      const score = toNumber(record.score);
      if (!dimension || weight === null || score === null) return null;
      return { dimension, weight, score };
    })
    .filter((item): item is SubScoreItem => item !== null);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}


function impactBadgeClass(value: string): string {
  switch (value) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "important":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function labelBadgeClass(value: string): string {
  switch (value) {
    case "strong":
    case "ahead":
    case "advanced":
    case "ipo_grade":
    case "ipo-grade":
    case "path_clear":
    case "profitable":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "moderate":
    case "partial":
    case "developing":
    case "solid":
    case "path_described":
    case "revenue_not_profitable":
    case "revenue-not-profitable":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "weak":
    case "none":
    case "basic":
    case "pre_revenue":
    case "pre-revenue":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function formatEnumLabel(value: string | undefined): string {
  if (!value) return "Unknown";
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function runwayTone(runwayMonths: number | null): string {
  if (runwayMonths === null) return "border-slate-200 bg-slate-50 text-slate-700";
  if (runwayMonths >= 18) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (runwayMonths >= 12) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function parseDataGapItems(value: unknown): Array<{ gap: string; impact: string; suggestedAction: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string" && item.trim().length > 0) {
        return { gap: item.trim(), impact: "important", suggestedAction: null };
      }
      const record = toRecord(item);
      const gap = toString(record.gap) ?? toString(record.description);
      if (!gap) return null;
      return {
        gap,
        impact: toString(record.impact) ?? "important",
        suggestedAction: toString(record.suggestedAction) ?? null,
      };
    })
    .filter((item): item is { gap: string; impact: string; suggestedAction: string | null } => item !== null);
}

function countTrue(values: Array<boolean | null>): number {
  return values.filter((value) => value === true).length;
}

function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

interface RevenuePoint { period: string; revenue: number }
interface BurnPoint { period: string; burn: number; cashBalance: number }
interface ScenarioPoint { period: string; [scenario: string]: string | number }
interface MarginPoint { period: string; grossMargin: number; operatingMargin: number }

function parseRevenueProjection(raw: unknown[]): RevenuePoint[] {
  return raw
    .map((item) => {
      const r = toRecord(item);
      const period = toString(r.period);
      const revenue = toNumber(r.revenue);
      if (!period || revenue === null) return null;
      return { period, revenue };
    })
    .filter((item): item is RevenuePoint => item !== null);
}

function parseBurnProjection(raw: unknown[]): BurnPoint[] {
  return raw
    .map((item) => {
      const r = toRecord(item);
      const period = toString(r.period);
      const burn = toNumber(r.burn);
      const cashBalance = toNumber(r.cashBalance) ?? 0;
      if (!period || burn === null) return null;
      return { period, burn, cashBalance };
    })
    .filter((item): item is BurnPoint => item !== null);
}

function parseScenarioComparison(raw: unknown[]): { data: ScenarioPoint[]; scenarioNames: string[] } {
  const scenarioNames = new Set<string>();
  const data = raw
    .map((item) => {
      const r = toRecord(item);
      const period = toString(r.period);
      if (!period) return null;
      const scenarios = toRecord(r.scenarios);
      const point: ScenarioPoint = { period };
      for (const [key, val] of Object.entries(scenarios)) {
        const num = toNumber(val);
        if (num !== null) {
          point[key] = num;
          scenarioNames.add(key);
        }
      }
      return point;
    })
    .filter((item): item is ScenarioPoint => item !== null);
  return { data, scenarioNames: Array.from(scenarioNames) };
}

function parseMarginProgression(raw: unknown[]): MarginPoint[] {
  return raw
    .map((item) => {
      const r = toRecord(item);
      const period = toString(r.period);
      const grossMargin = toNumber(r.grossMargin);
      const operatingMargin = toNumber(r.operatingMargin);
      if (!period) return null;
      return { period, grossMargin: grossMargin ?? 0, operatingMargin: operatingMargin ?? 0 };
    })
    .filter((item): item is MarginPoint => item !== null);
}

const SCENARIO_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const DONUT_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

function Gauge({
  label,
  steps,
  activeValue,
}: {
  label: string;
  steps: string[];
  activeValue: string | undefined;
}) {
  const normalized = activeValue?.replace(/-/g, "_");
  const activeIndex = steps.findIndex((step) => step === normalized);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="outline" className={labelBadgeClass(normalized ?? "")}>
          {formatEnumLabel(normalized)}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        {steps.map((step, index) => {
          const filled = activeIndex >= 0 && index <= activeIndex;
          return (
            <div
              key={step}
              className={`rounded-lg border px-3 py-2 text-xs ${
                filled ? labelBadgeClass(step) : "border-slate-200 bg-muted/20 text-muted-foreground"
              }`}
            >
              {formatEnumLabel(step)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoverageCell({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {value === true ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {value === null ? "Not covered" : value ? "Covered" : "Not covered"}
      </p>
    </div>
  );
}

export function FinancialsTabContent({ evaluation, financialsWeight }: FinancialsTabContentProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed" data-testid="card-financials-empty">
        <CardContent className="p-12 text-center">
          <PiggyBank className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 font-semibold">No financial data</h3>
          <p className="text-muted-foreground">
            Financial evaluation data has not been generated yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const financialsData = toRecord(evaluation.financialsData);
  const scoring = toRecord(financialsData.scoring);
  const keyMetrics = toRecord(financialsData.keyMetrics);
  const capitalPlan = toRecord(financialsData.capitalPlan);
  const projections = toRecord(financialsData.projections);
  const charts = toRecord(financialsData.charts);
  const financialPlanning = toRecord(financialsData.financialPlanning);

  const score =
    toNumber(evaluation.financialsScore) ??
    toNumber(scoring.overallScore) ??
    toNumber(financialsData.score) ??
    0;
  const confidence =
    toString(scoring.confidence) ??
    toString(financialsData.confidence) ??
    "unknown";
  const scoringBasis = toString(scoring.scoringBasis);
  const subScores = toSubScores(scoring.subScores);

  const financialModelProvided = toBoolean(financialsData.financialModelProvided) ?? false;
  const strengths = toStringArray(financialsData.strengths);
  const risks = toStringArray(financialsData.risks);
  const dataGaps = parseDataGapItems(financialsData.dataGaps);

  const raiseAmount = toString(keyMetrics.raiseAmount);
  const monthlyBurn = toString(keyMetrics.monthlyBurn);
  const runway = toString(keyMetrics.runway);
  const runwayMonths = toNumber(keyMetrics.runwayMonths);
  const useOfFundsBreakdown = Array.isArray(capitalPlan.useOfFundsBreakdown)
    ? (capitalPlan.useOfFundsBreakdown as unknown[]).map((item) => {
        const record = toRecord(item);
        return {
          category: toString(record.category) ?? "Unknown",
          percentage: toNumber(record.percentage) ?? 0,
        };
      })
    : [];

  const capitalCoverage = {
    burnPlanDescribed: toBoolean(capitalPlan.burnPlanDescribed),
    useOfFundsDescribed: toBoolean(capitalPlan.useOfFundsDescribed),
    runwayEstimated: toBoolean(capitalPlan.runwayEstimated),
    raiseJustified: toBoolean(capitalPlan.raiseJustified),
    milestoneTied: toBoolean(capitalPlan.milestoneTied),
    capitalEfficiencyAddressed: toBoolean(capitalPlan.capitalEfficiencyAddressed),
  };
  const capitalCoverageCount = countTrue(Object.values(capitalCoverage));
  const capitalPlanAvailable = capitalCoverageCount > 0;
  const capitalPlanSummary = toString(capitalPlan.summary);
  const milestoneAlignment = toString(capitalPlan.milestoneAlignment);

  const projectionsProvided = toBoolean(projections.provided) ?? false;
  const assumptionsStated = toBoolean(projections.assumptionsStated);
  const internallyConsistent = toBoolean(projections.internallyConsistent);
  const projectionsSummary = toString(projections.summary);
  const projectionsCredibility = toString(projections.credibility) ?? "none";
  const assumptions = Array.isArray(projections.assumptions)
    ? (projections.assumptions as unknown[]).map((item) => {
        const record = toRecord(item);
        return {
          assumption: toString(record.assumption) ?? "Unknown",
          value: toString(record.value) ?? "Unknown",
          assessment: toString(record.assessment) ?? "Unknown",
          verdict: toString(record.verdict) ?? "unsupported",
        };
      })
    : [];
  const profitabilityPath = toString(projections.profitabilityPath);
  const showUploadPrompt = !financialModelProvided;
  const showProjectionCoverage = projectionsProvided || financialModelProvided;

  const revenueProjection = Array.isArray(charts.revenueProjection) ? charts.revenueProjection as unknown[] : [];
  const burnProjection = Array.isArray(charts.burnProjection) ? charts.burnProjection as unknown[] : [];
  const scenarioComparison = Array.isArray(charts.scenarioComparison) ? charts.scenarioComparison as unknown[] : [];
  const marginProgression = Array.isArray(charts.marginProgression) ? charts.marginProgression as unknown[] : [];

  const sophisticationLevel = toString(financialPlanning.sophisticationLevel);
  const diligenceFlags = Array.isArray(financialPlanning.diligenceFlags)
    ? (financialPlanning.diligenceFlags as unknown[]).map((item) => {
        const record = toRecord(item);
        return {
          flag: toString(record.flag) ?? "Unknown",
          priority: toString(record.priority) ?? "routine",
        };
      })
    : [];
  const planningSummary = toString(financialPlanning.summary);

  return (
    <div className="space-y-6" data-testid="financials-tab-content">
      <SectionScoreCard
        title="Financial Plan Score"
        score={score}
        weight={typeof financialsWeight === "number" ? financialsWeight : undefined}
        confidence={confidence}
        scoringBasis={
          scoringBasis ??
          (confidence === "low"
            ? "Limited financial data available — score based on partial deck information."
            : confidence === "mid"
              ? "Partial financial data — upload a financial model for higher-confidence analysis."
              : undefined)
        }
        subScores={subScores}
        dataTestId="card-financials-score"
        confidenceTestId="badge-financials-confidence"
      />

      {(raiseAmount || monthlyBurn || runway || useOfFundsBreakdown.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {raiseAmount && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Wallet className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-lg font-semibold">{raiseAmount}</p>
                  <p className="text-xs text-muted-foreground">Raise Amount</p>
                </div>
              </CardContent>
            </Card>
          )}
          {monthlyBurn && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-lg font-semibold">{monthlyBurn}</p>
                  <p className="text-xs text-muted-foreground">Monthly Burn</p>
                </div>
              </CardContent>
            </Card>
          )}
          {runway && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Badge variant="outline" className={runwayTone(runwayMonths)}>
                  {runway}
                </Badge>
                <div>
                  <p className="text-xs font-medium">Post-Raise Runway</p>
                  <p className="text-xs text-muted-foreground">
                    {runwayMonths !== null ? `${runwayMonths} months` : "No numeric runway provided"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {useOfFundsBreakdown.length > 0 && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Target className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-lg font-semibold">{useOfFundsBreakdown.length}</p>
                  <p className="text-xs text-muted-foreground">Fund Allocation Categories</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capital Plan Assessment</CardTitle>
          <CardDescription>Coverage, allocation clarity, and milestone alignment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {capitalPlanAvailable ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{capitalCoverageCount}/6 elements described</p>
                {milestoneAlignment && (
                  <Badge variant="outline" className={labelBadgeClass(milestoneAlignment)}>
                    {formatEnumLabel(milestoneAlignment)}
                  </Badge>
                )}
              </div>

              <div className={`grid gap-4 ${useOfFundsBreakdown.length > 0 ? "md:grid-cols-2" : ""}`}>
                <div className="grid gap-3 grid-cols-2 xl:grid-cols-3 content-start">
                  <CoverageCell label="Burn Plan Described" value={capitalCoverage.burnPlanDescribed} />
                  <CoverageCell label="Use of Funds Breakdown" value={capitalCoverage.useOfFundsDescribed} />
                  <CoverageCell label="Runway Estimated" value={capitalCoverage.runwayEstimated} />
                  <CoverageCell label="Raise Justified" value={capitalCoverage.raiseJustified} />
                  <CoverageCell label="Milestones Tied to Capital" value={capitalCoverage.milestoneTied} />
                  <CoverageCell label="Capital Efficiency Addressed" value={capitalCoverage.capitalEfficiencyAddressed} />
                </div>

                {useOfFundsBreakdown.length > 0 && (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Use of Funds Breakdown</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-[180px] h-[180px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={useOfFundsBreakdown}
                              dataKey="percentage"
                              nameKey="category"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={75}
                              paddingAngle={2}
                            >
                              {useOfFundsBreakdown.map((_, idx) => (
                                <Cell key={idx} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `${Number(value).toFixed(0)}%`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full space-y-1.5">
                        {useOfFundsBreakdown.map((item, idx) => (
                          <div key={item.category} className="flex items-center gap-2 text-xs">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                            <span className="flex-1">{item.category}</span>
                            <span className="font-medium">{formatPercent(item.percentage)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {capitalPlanSummary && (
                <MarkdownText className="text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
                  {capitalPlanSummary}
                </MarkdownText>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/10 p-5 text-sm text-muted-foreground">
              Capital plan not covered in this deck. This has been flagged in Data Gaps below.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projection Assessment</CardTitle>
          <CardDescription>Projection coverage, credibility, and model depth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showUploadPrompt && (
            <div className="rounded-xl border border-dashed bg-primary/[0.04] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Upload Financial Model for Full Analysis</p>
                  <p className="text-sm text-muted-foreground">
                    Upload a financial model or projections spreadsheet to unlock detailed analysis.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-background p-2.5 text-xs">
                      <TrendingUp className="h-3.5 w-3.5 text-primary mb-1" />
                      <span className="font-medium">Revenue & burn projection charts</span>
                    </div>
                    <div className="rounded-lg border bg-background p-2.5 text-xs">
                      <BarChart3 className="h-3.5 w-3.5 text-primary mb-1" />
                      <span className="font-medium">Assumption-by-assumption stress test</span>
                    </div>
                    <div className="rounded-lg border bg-background p-2.5 text-xs">
                      <Target className="h-3.5 w-3.5 text-primary mb-1" />
                      <span className="font-medium">Scenario comparison visualization</span>
                    </div>
                    <div className="rounded-lg border bg-background p-2.5 text-xs">
                      <Wallet className="h-3.5 w-3.5 text-primary mb-1" />
                      <span className="font-medium">Profitability path & margin trajectory</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showProjectionCoverage ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <CoverageCell label="Projections Provided" value={projectionsProvided} />
                <CoverageCell label="Assumptions Stated" value={assumptionsStated} />
                <CoverageCell label="Internally Consistent" value={projectionsProvided ? internallyConsistent : null} />
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Credibility</p>
                  <Badge variant="outline" className={`mt-2 ${labelBadgeClass(projectionsCredibility)}`}>
                    {formatEnumLabel(projectionsCredibility)}
                  </Badge>
                </div>
              </div>
              {projectionsSummary && (
                <MarkdownText className="text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
                  {projectionsSummary}
                </MarkdownText>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Financial Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strengths.length > 0 ? (
              <ul className="space-y-2">
                {strengths.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No explicit financial strengths were captured in this run.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Financial Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {risks.length > 0 ? (
              <ul className="space-y-2">
                {risks.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No explicit financial risks were captured in this run.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Gaps & Diligence</CardTitle>
        </CardHeader>
        <CardContent>
          {dataGaps.length > 0 ? (
            <div className="space-y-3">
              {dataGaps.map((item, index) => (
                <div key={`${item.gap}-${index}`} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.gap}</p>
                    <Badge variant="outline" className={impactBadgeClass(item.impact)}>
                      {formatEnumLabel(item.impact)}
                    </Badge>
                  </div>
                  {item.suggestedAction && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Suggested action: {item.suggestedAction}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No financial diligence gaps are listed yet.</p>
          )}
        </CardContent>
      </Card>

      {financialModelProvided && (
        <>
          {(() => {
            const revData = parseRevenueProjection(revenueProjection);
            const burnData = parseBurnProjection(burnProjection);
            const { data: scenarioData, scenarioNames } = parseScenarioComparison(scenarioComparison);
            const marginData = parseMarginProgression(marginProgression);
            const hasCharts = revData.length > 0 || burnData.length > 0 || scenarioData.length > 0 || marginData.length > 0;
            if (!hasCharts) return null;
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Financial Projections
                  </CardTitle>
                  <CardDescription>Charts derived from the uploaded financial model.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 lg:grid-cols-2">
                    {revData.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Revenue Projection</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={revData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={formatCompactCurrency} tick={{ fontSize: 10 }} width={60} />
                            <Tooltip formatter={(value) => formatCompactCurrency(Number(value))} />
                            <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {burnData.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Burn & Cash Runway</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <ComposedChart data={burnData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="left" tickFormatter={formatCompactCurrency} tick={{ fontSize: 10 }} width={60} />
                            <YAxis yAxisId="right" orientation="right" tickFormatter={formatCompactCurrency} tick={{ fontSize: 10 }} width={60} />
                            <Tooltip formatter={(value) => formatCompactCurrency(Number(value))} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar yAxisId="left" dataKey="burn" fill="#ef4444" opacity={0.7} name="Monthly Burn" />
                            <Line yAxisId="right" type="monotone" dataKey="cashBalance" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Cash Balance" />
                            <ReferenceLine yAxisId="right" y={0} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "Zero Cash", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {scenarioData.length > 0 && scenarioNames.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Scenario Comparison</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={scenarioData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={formatCompactCurrency} tick={{ fontSize: 10 }} width={60} />
                            <Tooltip formatter={(value) => formatCompactCurrency(Number(value))} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            {scenarioNames.map((name, idx) => (
                              <Line key={name} type="monotone" dataKey={name} stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {marginData.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Margin Progression</p>
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={marginData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10 }} width={45} />
                            <Tooltip formatter={(value) => `${Number(value).toFixed(1)}%`} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Area type="monotone" dataKey="grossMargin" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} name="Gross Margin" />
                            <Area type="monotone" dataKey="operatingMargin" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} name="Operating Margin" />
                            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assumption Deep Dive</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {assumptions.length > 0 ? (
                <div className="space-y-3">
                  {assumptions.map((item, index) => (
                    <div key={`${item.assumption}-${index}`} className="rounded-lg border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{item.assumption}</p>
                          <p className="text-xs text-muted-foreground">Value: {item.value}</p>
                        </div>
                        <Badge variant="outline" className={labelBadgeClass(item.verdict)}>
                          {formatEnumLabel(item.verdict)}
                        </Badge>
                      </div>
                      <MarkdownText className="mt-2 text-sm text-muted-foreground [&>p]:mb-0">
                        {item.assessment}
                      </MarkdownText>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No structured assumptions were extracted from the model.
                </p>
              )}

              <Gauge
                label="Profitability Path"
                steps={["pre_revenue", "revenue_not_profitable", "path_described", "path_clear", "profitable"]}
                activeValue={profitabilityPath}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial Planning Maturity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Gauge
                label="Planning Sophistication"
                steps={["basic", "developing", "solid", "advanced", "ipo_grade"]}
                activeValue={sophisticationLevel}
              />

              {diligenceFlags.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Diligence Flags</p>
                  {diligenceFlags.map((item, index) => (
                    <div key={`${item.flag}-${index}`} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/20 p-4">
                      <p className="text-sm">{item.flag}</p>
                      <Badge variant="outline" className={impactBadgeClass(item.priority)}>
                        {formatEnumLabel(item.priority)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {planningSummary && (
                <MarkdownText className="text-sm text-muted-foreground [&>p]:mb-0">
                  {planningSummary}
                </MarkdownText>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
