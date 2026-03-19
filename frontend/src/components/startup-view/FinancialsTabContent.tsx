import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { DataGapsSection, parseDataGapItems } from "@/components/DataGapsSection";
import { MarkdownText } from "@/components/MarkdownText";
import { cn } from "@/lib/utils";
import {
  PiggyBank,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Target,
  FileSpreadsheet,
  BarChart3,
  Flame,
  Clock,
  CircleDollarSign,
  ShieldAlert,
  Flag,
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FinancialsTabContentProps {
  evaluation: Evaluation | null;
  financialsWeight?: number;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

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

function labelBadgeClass(value: string): string {
  switch (value) {
    case "strong":
    case "ahead":
    case "advanced":
    case "ipo_grade":
    case "ipo-grade":
    case "path_clear":
    case "profitable":
    case "reasonable":
    case "conservative":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400";
    case "moderate":
    case "partial":
    case "developing":
    case "solid":
    case "path_described":
    case "revenue_not_profitable":
    case "revenue-not-profitable":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
    case "weak":
    case "none":
    case "basic":
    case "pre_revenue":
    case "pre-revenue":
    case "aggressive":
    case "unsupported":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";
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

function runwayColorClass(runwayMonths: number | null): string {
  if (runwayMonths === null) return "from-slate-500/20 to-slate-500/5";
  if (runwayMonths >= 18) return "from-emerald-500/20 to-emerald-500/5";
  if (runwayMonths >= 12) return "from-amber-500/20 to-amber-500/5";
  return "from-rose-500/20 to-rose-500/5";
}

function runwayBarColor(runwayMonths: number | null): string {
  if (runwayMonths === null) return "bg-slate-400";
  if (runwayMonths >= 18) return "bg-emerald-500";
  if (runwayMonths >= 12) return "bg-amber-500";
  return "bg-rose-500";
}

function priorityIcon(priority: string) {
  switch (priority) {
    case "critical":
      return <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500" />;
    case "important":
      return <Flag className="h-4 w-4 shrink-0 text-amber-500" />;
    default:
      return <Flag className="h-4 w-4 shrink-0 text-slate-400" />;
  }
}

function priorityBadgeClass(value: string): string {
  switch (value) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400";
    case "important":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";
  }
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

// ---------------------------------------------------------------------------
// Chart data parsers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Enhanced step gauge with filled progress bar */
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
  const progressPercent = activeIndex >= 0 ? ((activeIndex + 1) / steps.length) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{label}</p>
        <Badge variant="outline" className={labelBadgeClass(normalized ?? "")}>
          {formatEnumLabel(normalized)}
        </Badge>
      </div>
      {/* Progress bar track */}
      <div className="relative">
        <div className="h-1.5 rounded-full bg-muted/50 dark:bg-muted/30">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              activeIndex >= steps.length - 2
                ? "bg-emerald-500"
                : activeIndex >= Math.floor(steps.length / 2)
                  ? "bg-amber-500"
                  : "bg-rose-400",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      {/* Step indicators */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const isActive = activeIndex >= 0 && index === activeIndex;
          const filled = activeIndex >= 0 && index <= activeIndex;
          return (
            <div
              key={step}
              className={cn(
                "rounded-lg border px-2 py-2 text-center text-xs transition-all",
                isActive
                  ? cn("ring-2 ring-offset-1 font-semibold", labelBadgeClass(step))
                  : filled
                    ? labelBadgeClass(step)
                    : "border-slate-200 bg-muted/20 text-muted-foreground dark:border-slate-700",
              )}
            >
              {formatEnumLabel(step)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Enhanced coverage cell with filled/empty circle states */
function CoverageCell({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        value === true
          ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/20"
          : "bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {value === true ? (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted/60">
            <div className="h-2 w-2 rounded-full border-2 border-muted-foreground/30" />
          </div>
        )}
      </div>
      <p className={cn(
        "mt-2 text-xs",
        value === true ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}>
        {value === null ? "Not covered" : value ? "Covered" : "Not covered"}
      </p>
    </div>
  );
}

/** SVG circular progress arc for coverage ratio */
function CoverageArc({ count, total }: { count: number; total: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? count / total : 0;
  const dashOffset = circumference * (1 - ratio);
  const color = ratio >= 0.8 ? "stroke-emerald-500" : ratio >= 0.5 ? "stroke-amber-500" : "stroke-rose-400";

  return (
    <div className="flex items-center gap-4">
      <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="6" className="stroke-muted/40" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={cn("transition-all duration-700", color)}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="40" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-lg font-bold">
          {count}/{total}
        </text>
      </svg>
      <div>
        <p className="text-sm font-medium">Plan Coverage</p>
        <p className="text-xs text-muted-foreground">
          {count === total
            ? "Full coverage achieved"
            : `${total - count} element${total - count > 1 ? "s" : ""} not covered`}
        </p>
      </div>
    </div>
  );
}

/** Credibility meter bar */
function CredibilityMeter({ level }: { level: string }) {
  const levels = ["none", "weak", "moderate", "strong"];
  const activeIndex = levels.indexOf(level.toLowerCase());
  const percent = activeIndex >= 0 ? ((activeIndex + 1) / levels.length) * 100 : 0;
  const barColor = activeIndex >= 3
    ? "bg-emerald-500"
    : activeIndex >= 2
      ? "bg-amber-500"
      : activeIndex >= 1
        ? "bg-orange-400"
        : "bg-rose-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Credibility</p>
        <Badge variant="outline" className={labelBadgeClass(level)}>
          {formatEnumLabel(level)}
        </Badge>
      </div>
      <div className="h-2.5 rounded-full bg-muted/50 dark:bg-muted/30">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {levels.map((l) => (
          <span key={l} className={cn(l === level.toLowerCase() && "font-semibold text-foreground")}>
            {formatEnumLabel(l)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  // Max runway for the visual bar (cap at 36 months)
  const maxRunway = 36;
  const runwayBarPercent = runwayMonths !== null ? Math.min((runwayMonths / maxRunway) * 100, 100) : 0;

  return (
    <div className="space-y-6" data-testid="financials-tab-content">
      {/* ================================================================= */}
      {/* Score Card                                                        */}
      {/* ================================================================= */}
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

      {/* ================================================================= */}
      {/* Hero Stat Cards                                                   */}
      {/* ================================================================= */}
      {(raiseAmount || monthlyBurn || runway || useOfFundsBreakdown.length > 0) && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {raiseAmount && (
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-violet-500/10 via-background to-background shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <CircleDollarSign className="h-4 w-4 text-violet-500" />
                  <span>Raise Amount</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{raiseAmount}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Target capital raise</p>
              </CardContent>
            </Card>
          )}
          {monthlyBurn && (
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 via-background to-background shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  <span>Monthly Burn</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{monthlyBurn}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Operating cash outflow</p>
              </CardContent>
            </Card>
          )}
          {runway && (
            <Card className={cn(
              "overflow-hidden border-0 shadow-sm bg-gradient-to-br via-background to-background",
              runwayColorClass(runwayMonths),
            )}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Clock className="h-4 w-4" />
                  <span>Post-Raise Runway</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">
                  {runwayMonths !== null ? `${runwayMonths}mo` : runway}
                </p>
                {runwayMonths !== null && (
                  <div className="mt-2 space-y-1">
                    <div className="h-2 rounded-full bg-muted/40">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", runwayBarColor(runwayMonths))}
                        style={{ width: `${runwayBarPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0</span>
                      <span>{runwayMonths >= 18 ? "Healthy" : runwayMonths >= 12 ? "Adequate" : "Low"}</span>
                      <span>36mo</span>
                    </div>
                  </div>
                )}
                {runwayMonths === null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">No numeric estimate</p>
                )}
              </CardContent>
            </Card>
          )}
          {useOfFundsBreakdown.length > 0 && (
            <Card className="overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 via-background to-background shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Target className="h-4 w-4 text-blue-500" />
                  <span>Fund Allocation</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{useOfFundsBreakdown.length}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Allocation categories</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Capital Plan Assessment                                           */}
      {/* ================================================================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capital Plan Assessment</CardTitle>
          <CardDescription>Coverage, allocation clarity, and milestone alignment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {capitalPlanAvailable ? (
            <>
              {/* Top: Circular arc + milestone alignment */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <CoverageArc count={capitalCoverageCount} total={6} />
                {milestoneAlignment && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-1">Milestone Alignment</p>
                    <Badge variant="outline" className={cn("text-sm", labelBadgeClass(milestoneAlignment))}>
                      {formatEnumLabel(milestoneAlignment)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Coverage cells + Donut side by side */}
              <div className={cn("grid gap-4", useOfFundsBreakdown.length > 0 ? "lg:grid-cols-2" : "")}>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 content-start">
                  <CoverageCell label="Burn Plan Described" value={capitalCoverage.burnPlanDescribed} />
                  <CoverageCell label="Use of Funds Breakdown" value={capitalCoverage.useOfFundsDescribed} />
                  <CoverageCell label="Runway Estimated" value={capitalCoverage.runwayEstimated} />
                  <CoverageCell label="Raise Justified" value={capitalCoverage.raiseJustified} />
                  <CoverageCell label="Milestones Tied to Capital" value={capitalCoverage.milestoneTied} />
                  <CoverageCell label="Capital Efficiency Addressed" value={capitalCoverage.capitalEfficiencyAddressed} />
                </div>

                {useOfFundsBreakdown.length > 0 && (
                  <div className="rounded-xl border bg-muted/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Use of Funds Breakdown</p>
                    </div>
                    {/* Horizontal layout: donut + legend */}
                    <div className="flex items-center gap-4">
                      <div className="w-[140px] h-[140px] shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={useOfFundsBreakdown}
                              dataKey="percentage"
                              nameKey="category"
                              cx="50%"
                              cy="50%"
                              innerRadius={35}
                              outerRadius={60}
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
                      <div className="flex-1 space-y-1.5">
                        {useOfFundsBreakdown.map((item, idx) => (
                          <div key={item.category} className="flex items-center gap-2 text-xs">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                            />
                            <span className="flex-1 truncate">{item.category}</span>
                            <span className="font-semibold tabular-nums">{formatPercent(item.percentage)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {capitalPlanSummary && (
                <div className="rounded-lg bg-muted/30 px-4 py-3 dark:bg-muted/20">
                  <MarkdownText className="text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
                    {capitalPlanSummary}
                  </MarkdownText>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/10 p-5 text-sm text-muted-foreground">
              Capital plan not covered in this deck. This has been flagged in Data Gaps below.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Projection Assessment                                             */}
      {/* ================================================================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projection Assessment</CardTitle>
          <CardDescription>Projection coverage, credibility, and model depth.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {showUploadPrompt && (
            <div className="rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/[0.04] to-transparent p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-primary/10 p-3">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-semibold">Upload Financial Model for Full Analysis</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Upload a financial model or projections spreadsheet to unlock detailed analysis.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: TrendingUp, label: "Revenue & burn projection charts" },
                      { icon: BarChart3, label: "Assumption-by-assumption stress test" },
                      { icon: Target, label: "Scenario comparison visualization" },
                      { icon: Wallet, label: "Profitability path & margin trajectory" },
                    ].map(({ icon: Icon, label }) => (
                      <div key={label} className="flex items-start gap-2 rounded-lg border bg-background p-2.5">
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="text-xs font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {showProjectionCoverage ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <CoverageCell label="Projections Provided" value={projectionsProvided} />
                <CoverageCell label="Assumptions Stated" value={assumptionsStated} />
                <CoverageCell label="Internally Consistent" value={projectionsProvided ? internallyConsistent : null} />
              </div>

              {/* Credibility meter */}
              <div className="rounded-lg border bg-muted/10 p-4">
                <CredibilityMeter level={projectionsCredibility} />
              </div>

              {projectionsSummary && (
                <div className="rounded-lg bg-muted/30 px-4 py-3 dark:bg-muted/20">
                  <MarkdownText className="text-sm leading-relaxed text-muted-foreground [&>p]:mb-0">
                    {projectionsSummary}
                  </MarkdownText>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Strengths & Risks — Single card, two columns                      */}
      {/* ================================================================= */}
      {(strengths.length > 0 || risks.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Financial Strengths & Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* Strengths column */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-sm font-semibold">Strengths</h4>
                </div>
                {strengths.length > 0 ? (
                  <div className="space-y-2">
                    {strengths.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex items-start gap-3 rounded-lg border-l-2 border-l-emerald-400 bg-emerald-50/30 py-2.5 pl-3 pr-3 dark:bg-emerald-950/10"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                          {index + 1}
                        </span>
                        <span className="text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No explicit financial strengths captured.</p>
                )}
              </div>

              {/* Risks column */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  <h4 className="text-sm font-semibold">Risks</h4>
                </div>
                {risks.length > 0 ? (
                  <div className="space-y-2">
                    {risks.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex items-start gap-3 rounded-lg border-l-2 border-l-rose-400 bg-rose-50/30 py-2.5 pl-3 pr-3 dark:bg-rose-950/10"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-700 dark:bg-rose-900/50 dark:text-rose-400">
                          {index + 1}
                        </span>
                        <span className="text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No explicit financial risks captured.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================= */}
      {/* Data Gaps — Shared component                                      */}
      {/* ================================================================= */}
      <DataGapsSection
        gaps={dataGaps}
        emptyMessage="No financial diligence gaps are listed yet."
      />

      {/* ================================================================= */}
      {/* Financial Projections Charts                                       */}
      {/* ================================================================= */}
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
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Financial Projections
                  </CardTitle>
                  <CardDescription>Charts derived from the uploaded financial model.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 lg:grid-cols-2">
                    {revData.length > 0 && (
                      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium">Revenue Projection</p>
                          <p className="text-xs text-muted-foreground">Forecasted revenue over time</p>
                        </div>
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
                      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium">Burn & Cash Runway</p>
                          <p className="text-xs text-muted-foreground">Monthly burn rate vs remaining cash</p>
                        </div>
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
                      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium">Scenario Comparison</p>
                          <p className="text-xs text-muted-foreground">Best, base, and worst case projections</p>
                        </div>
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
                      <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium">Margin Progression</p>
                          <p className="text-xs text-muted-foreground">Gross and operating margin trajectory</p>
                        </div>
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

          {/* ============================================================= */}
          {/* Assumption Deep Dive — Table layout                            */}
          {/* ============================================================= */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assumption Deep Dive</CardTitle>
              <CardDescription>Individual assumption assessment and verdicts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {assumptions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-3 pr-4 text-left font-medium">Assumption</th>
                        <th className="pb-3 pr-4 text-left font-medium">Value</th>
                        <th className="pb-3 pr-4 text-left font-medium">Assessment</th>
                        <th className="pb-3 text-left font-medium">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assumptions.map((item, index) => (
                        <tr
                          key={`${item.assumption}-${index}`}
                          className="border-b border-border/40 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium align-top">{item.assumption}</td>
                          <td className="py-3 pr-4 align-top">
                            <span className="font-mono text-xs">{item.value}</span>
                          </td>
                          <td className="py-3 pr-4 align-top">
                            <MarkdownText className="text-xs text-muted-foreground [&>p]:mb-0">
                              {item.assessment}
                            </MarkdownText>
                          </td>
                          <td className="py-3 align-top">
                            <Badge variant="outline" className={labelBadgeClass(item.verdict)}>
                              {formatEnumLabel(item.verdict)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No structured assumptions were extracted from the model.
                </p>
              )}

              <div className="rounded-lg border bg-muted/10 p-4">
                <Gauge
                  label="Profitability Path"
                  steps={["pre_revenue", "revenue_not_profitable", "path_described", "path_clear", "profitable"]}
                  activeValue={profitabilityPath}
                />
              </div>
            </CardContent>
          </Card>

          {/* ============================================================= */}
          {/* Financial Planning Maturity                                     */}
          {/* ============================================================= */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial Planning Maturity</CardTitle>
              <CardDescription>Sophistication level and diligence readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-muted/10 p-4">
                <Gauge
                  label="Planning Sophistication"
                  steps={["basic", "developing", "solid", "advanced", "ipo_grade"]}
                  activeValue={sophisticationLevel}
                />
              </div>

              {diligenceFlags.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Diligence Flags</p>
                  <div className="space-y-2">
                    {diligenceFlags.map((item, index) => (
                      <div
                        key={`${item.flag}-${index}`}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3",
                          item.priority === "critical"
                            ? "border-l-2 border-l-rose-400 bg-rose-50/30 dark:bg-rose-950/10"
                            : item.priority === "important"
                              ? "border-l-2 border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10"
                              : "bg-muted/20",
                        )}
                      >
                        {priorityIcon(item.priority)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{item.flag}</p>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0", priorityBadgeClass(item.priority))}>
                          {formatEnumLabel(item.priority)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {planningSummary && (
                <div className="rounded-lg bg-muted/30 px-4 py-3 dark:bg-muted/20">
                  <MarkdownText className="text-sm text-muted-foreground [&>p]:mb-0">
                    {planningSummary}
                  </MarkdownText>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
