import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { MarkdownText } from "@/components/MarkdownText";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { CheckCircle2, AlertTriangle, ChevronRight, Sparkles, TrendingUp, AlertCircle, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation, ExitScenario } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";
import {
  getDisplayOverallScore,
  getDisplayPercentileRank,
  getDisplayRisks,
  getDisplaySectionScore,
  getDisplayStrengths,
  getAllStructuredDataGaps,
  getCrossAgentDataGaps,
  getAgentTab,
} from "@/lib/evaluation-display";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { extractKpiMetrics, formatIndustry, formatValuationLabel } from "@/lib/kpi-metrics";
import { KpiGrid } from "@/components/startup-view/KpiGrid";

interface AdminSummaryTabProps {
  startup: Startup;
  thesisAlignment?: {
    thesisFitScore: number;
    rationale: string;
  } | null;
  evaluation?: Evaluation;
  weights?: ScoringWeights | null;
  onNavigateTab?: (tab: string) => void;
}

interface SectionScoreRow {
  id: string;
  label: string;
  score: number;
  weight: number;
  pending: boolean;
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

function moicColor(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 5) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 3) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function irrColor(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 30) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 15) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function buildRow(evaluation: Evaluation, id: string, label: string, key: Parameters<typeof getDisplaySectionScore>[1], weight: number): SectionScoreRow {
  const raw = getDisplaySectionScore(evaluation, key);
  return { id, label, score: raw ?? 0, weight, pending: raw === null };
}

function getSectionRows(evaluation: Evaluation, weights?: ScoringWeights | null): SectionScoreRow[] {
  return [
    buildRow(evaluation, "team", "Team", "team", weights?.team ?? 0),
    buildRow(evaluation, "market", "Market", "market", weights?.market ?? 0),
    buildRow(evaluation, "product", "Product", "product", weights?.product ?? 0),
    buildRow(evaluation, "traction", "Traction", "traction", weights?.traction ?? 0),
    buildRow(evaluation, "businessModel", "Business Model", "businessModel", weights?.businessModel ?? 0),
    buildRow(evaluation, "gtm", "GTM", "gtm", weights?.gtm ?? 0),
    buildRow(evaluation, "competitiveAdvantage", "Competitive Advantage", "competitiveAdvantage", weights?.competitiveAdvantage ?? 0),
    buildRow(evaluation, "financials", "Financials", "financials", weights?.financials ?? 0),
    buildRow(evaluation, "legal", "Legal", "legal", weights?.legal ?? 0),
    buildRow(evaluation, "dealTerms", "Deal Terms", "dealTerms", weights?.dealTerms ?? 0),
    buildRow(evaluation, "exitPotential", "Exit Potential", "exitPotential", weights?.exitPotential ?? 0),
  ];
}

function AgentBadge({
  label,
  agent,
  onClick,
}: {
  label: string;
  agent: string;
  onClick?: (tab: string) => void;
}) {
  const tab = getAgentTab(agent);
  return (
    <button
      type="button"
      onClick={() => onClick?.(tab)}
      className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-200 transition-colors cursor-pointer dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60"
    >
      {label}
    </button>
  );
}

const GAPS_INITIAL_COUNT = 5;

const IMPACT_BADGE_STYLES: Record<string, string> = {
  critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  important: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  minor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

function DataGapsCard({
  allGaps,
  plainGaps,
  onNavigateTab,
}: {
  allGaps: import("@/lib/evaluation-display").CriticalDataGap[];
  plainGaps: import("@/lib/evaluation-display").AgentTaggedItem[];
  onNavigateTab?: (tab: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasStructured = allGaps.length > 0;
  const items = hasStructured ? allGaps : [];
  const visibleItems = expanded ? items : items.slice(0, GAPS_INITIAL_COUNT);
  const hiddenCount = items.length - GAPS_INITIAL_COUNT;

  return (
    <Card className="border-orange-200/80 dark:border-orange-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-orange-700 dark:text-orange-400">
          <AlertCircle className="h-4 w-4" />
          Critical Data Gaps
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Information gaps flagged by evaluation agents — may require follow-up diligence
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {hasStructured
            ? visibleItems.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <div className="flex-1">
                    <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item.gap}</MarkdownText>
                    {item.suggestedAction && (
                      <MarkdownText className="mt-0.5 text-xs text-muted-foreground [&>p]:mb-0">{item.suggestedAction}</MarkdownText>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                      IMPACT_BADGE_STYLES[item.impact] ?? IMPACT_BADGE_STYLES.minor,
                    )}>
                      {item.impact}
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">{item.source}</span>
                  </div>
                </li>
              ))
            : plainGaps.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <MarkdownText className="flex-1 inline [&>p]:inline [&>p]:mb-0">{item.text}</MarkdownText>
                  <AgentBadge label={item.agentLabel} agent={item.agent} onClick={onNavigateTab} />
                </li>
              ))
          }
        </ul>
        {hasStructured && hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors cursor-pointer"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                View {hiddenCount} more gap{hiddenCount > 1 ? "s" : ""}
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

const METRIC_ROWS = [
  { key: "moic", label: "MOIC" },
  { key: "irr", label: "IRR" },
  { key: "valuation", label: "Valuation" },
  { key: "timeline", label: "Timeline" },
] as const;

function ExitScenariosCard({ scenarios }: { scenarios: ExitScenario[] }) {
  const [showBasis, setShowBasis] = useState(false);
  const hasBasis = scenarios.some((s) => s.researchBasis);

  if (scenarios.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Exit Scenarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground/60 italic text-center py-4">
            Exit scenarios will be available after re-analysis
          </p>
        </CardContent>
      </Card>
    );
  }

  const getValue = (s: ExitScenario, key: (typeof METRIC_ROWS)[number]["key"]) => {
    switch (key) {
      case "moic":
        return { text: formatMoic(s.moic), className: `font-bold tabular-nums ${moicColor(s.moic)}` };
      case "irr":
        return { text: formatPercent(s.irr), className: `font-medium tabular-nums ${irrColor(s.irr)}` };
      case "valuation":
        return { text: s.exitValuation || "N/A", className: "font-medium" };
      case "timeline":
        return { text: s.timeline || "N/A", className: "text-muted-foreground" };
    }
  };

  return (
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
        {/* Desktop: comparison table */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[100px_1fr_1fr_1fr] text-sm">
            {/* Header row */}
            <div />
            {scenarios.map((s) => (
              <div key={s.scenario} className="px-4 pb-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.scenario}
                </p>
                <span className="mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                  {s.exitType}
                </span>
              </div>
            ))}
            {/* Metric rows */}
            {METRIC_ROWS.map((row, ri) => (
              <div key={row.key} className="contents">
                <div className={cn(
                  "flex items-center text-xs font-medium text-muted-foreground py-3 pr-3",
                  ri > 0 && "border-t border-border/50",
                )}>
                  {row.label}
                </div>
                {scenarios.map((s) => {
                  const v = getValue(s, row.key);
                  return (
                    <div
                      key={s.scenario}
                      className={cn(
                        "flex items-center justify-center px-4 py-3 text-center",
                        ri > 0 && "border-t border-border/50",
                        row.key === "moic" ? "text-2xl" : "text-sm",
                        v.className,
                      )}
                    >
                      <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{v.text}</MarkdownText>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: stacked cards */}
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {scenarios.map((s) => (
            <div key={s.scenario} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.scenario}
                </p>
                <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                  {s.exitType}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 pt-1">
                {METRIC_ROWS.map((row) => {
                  const v = getValue(s, row.key);
                  return (
                    <div key={row.key}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.label}</p>
                      <MarkdownText className={cn(
                        row.key === "moic" ? "text-lg" : "text-sm",
                        v.className,
                        "[&>p]:mb-0",
                      )}>
                        {v.text}
                      </MarkdownText>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Research basis toggle */}
        {hasBasis && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowBasis((p) => !p)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {showBasis ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Research basis
            </button>
            {showBasis && (
              <div className="mt-3 space-y-3">
                {scenarios.filter((s) => s.researchBasis).map((s) => (
                  <div key={s.scenario}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {s.scenario}
                    </p>
                    <MarkdownText className="text-xs leading-relaxed text-muted-foreground [&>p]:mb-0">
                      {s.researchBasis}
                    </MarkdownText>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminSummaryTab({
  startup,
  evaluation,
  weights,
  onNavigateTab,
  thesisAlignment,
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
  const exitScenarioSource: ExitScenario[] =
    (evaluation?.exitScenarios as ExitScenario[] | undefined) ??
    ((evaluation?.exitPotentialData as Record<string, unknown> | undefined)?.exitScenarios as ExitScenario[] | undefined) ??
    [];
  const exitScenarios = [...exitScenarioSource].sort(
    (left, right) =>
      EXIT_SCENARIO_DISPLAY_ORDER[left.scenario] -
      EXIT_SCENARIO_DISPLAY_ORDER[right.scenario],
  );

  const allGaps = getAllStructuredDataGaps(evaluation);
  const plainGaps = getCrossAgentDataGaps(evaluation);

  const RADAR_SHORT_LABELS: Record<string, string> = {
    "Competitive Advantage": "Comp. Adv.",
    "Business Model": "Biz Model",
    "Exit Potential": "Exit",
    "Deal Terms": "Deal",
    Financials: "Finance",
  };

  const radarData = sectionRows.map((row) => ({
    label: row.pending ? `${RADAR_SHORT_LABELS[row.label] ?? row.label} ⏳` : (RADAR_SHORT_LABELS[row.label] ?? row.label),
    fullLabel: row.label,
    score: row.pending ? 0 : row.score,
    weight: row.weight,
    pending: row.pending,
    fullMark: 100,
  }));

  return (
    <div className="space-y-6">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className={cn(
              "grid items-center gap-0",
              sectionRows.length > 0
                ? "md:grid-cols-[auto_1px_260px_1px_1fr]"
                : "md:grid-cols-[auto_1px_1fr]",
            )}>
              {/* Col 1: Score */}
              <div className="flex flex-col items-center justify-center px-5 py-2">
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-5xl font-bold tabular-nums tracking-tight",
                    score >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                    score >= 65 ? "text-green-500 dark:text-green-400" :
                    score >= 51 ? "text-orange-500 dark:text-orange-400" :
                    "text-rose-600 dark:text-rose-400",
                  )}>
                    {Math.round(score)}
                  </span>
                  <span className="text-lg text-muted-foreground tabular-nums">/100</span>
                </div>
                <div className="mt-2 flex flex-col items-center gap-1.5">
                  <ConfidenceBadge
                    confidence={overallConfidence}
                    dataTestId="badge-overall-confidence"
                  />
                  <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-medium tabular-nums">
                    {percentile}
                  </span>
                </div>
              </div>

              {/* Divider 1 */}
              <div className="hidden md:block self-stretch bg-border" />

              {/* Col 2: Radar */}
              {sectionRows.length > 0 && (
                <>
                  <div className="border-t md:border-t-0 py-2 md:py-0">
                    <ResponsiveContainer width="100%" height={240}>
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="60%">
                        <PolarGrid stroke="currentColor" strokeOpacity={0.1} />
                        <PolarAngleAxis
                          dataKey="label"
                          tick={(tickProps: Record<string, unknown>) => {
                            const x = tickProps.x as number;
                            const y = tickProps.y as number;
                            const anchor = tickProps.textAnchor as "start" | "middle" | "end";
                            const pl = tickProps.payload as { value: string };
                            const entry = radarData.find((d) => d.label === pl.value);
                            const scoreVal = entry && !entry.pending ? Math.round(entry.score) : null;
                            const fillColor = scoreVal !== null
                              ? scoreVal >= 80 ? "#059669" : scoreVal >= 65 ? "#22c55e" : scoreVal >= 51 ? "#f97316" : "#e11d48"
                              : "currentColor";
                            // Center the score under the label regardless of text anchor direction
                            const CHAR_W = 5.5;
                            const halfW = (pl.value.length * CHAR_W) / 2;
                            const cx = anchor === "start" ? x + halfW : anchor === "end" ? x - halfW : x;
                            return (
                              <g>
                                <text x={cx} y={y - 3} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.6}>
                                  {pl.value}
                                </text>
                                {scoreVal !== null && (
                                  <text x={cx} y={y + 10} textAnchor="middle" fontSize={11} fontWeight={700} fill={fillColor}>
                                    {scoreVal}
                                  </text>
                                )}
                              </g>
                            );
                          }}
                          tickLine={false}
                        />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
                        <Radar
                          dataKey="score"
                          stroke="#163F67"
                          fill="#C9E0F9"
                          fillOpacity={0.35}
                          strokeWidth={1.5}
                          dot={{ r: 2.5, fill: "#163F67", strokeWidth: 0 }}
                        />
                        <Tooltip
                          content={({ active, payload: tp }) => {
                            if (!active || !tp?.length) return null;
                            const d = tp[0].payload as (typeof radarData)[number];
                            if (d.pending) return null;
                            return (
                              <div className="rounded-md border bg-popover px-3 py-2 shadow-md text-popover-foreground">
                                <p className="text-sm font-medium text-balance">{d.fullLabel}</p>
                                <div className="mt-1 space-y-0.5">
                                  <p className="text-xs text-muted-foreground">
                                    Score: <span className="font-medium text-foreground tabular-nums">{Math.round(d.score)}/100</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Weight: <span className="font-medium text-foreground tabular-nums">{d.weight}%</span>
                                  </p>
                                </div>
                              </div>
                            );
                          }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Divider 2 */}
                  <div className="hidden md:block self-stretch bg-border" />
                </>
              )}

              {/* Col 3: Metadata */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t md:border-t-0 pt-4 md:pt-0 md:pl-5">
                {[
                  { label: "Stage", value: formatStage(startup.stage), accent: false },
                  { label: "Sector", value: startup.sectorIndustryGroup || "N/A", accent: false },
                  { label: "Industry", value: formatIndustry(startup.sectorIndustry || startup.industry), accent: false },
                  { label: "Location", value: startup.location || "N/A", accent: false },
                  { label: "Round", value: formatCompactCurrency(startup.fundingTarget), accent: true },
                  { label: "Valuation", value: `${formatCompactCurrency(startup.valuation)} ${formatValuationLabel(startup.valuationType)}`.trim(), accent: true },
                  { label: "Raise", value: formatRaiseType(startup.raiseType), accent: false },
                  { label: "Lead", value: startup.leadInvestorName || "No", accent: false },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    <p className={cn(
                      "text-sm font-medium text-pretty",
                      item.accent && "text-primary",
                    )}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {thesisAlignment && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-start gap-4">
            <ScoreRing score={thesisAlignment.thesisFitScore} size="md" showLabel variant="secondary" />
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">Thesis Fit</span>
                <span className={cn(
                  "ml-auto text-xs font-bold tabular-nums",
                  thesisAlignment.thesisFitScore >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                  thesisAlignment.thesisFitScore >= 60 ? "text-green-600 dark:text-green-400" :
                  thesisAlignment.thesisFitScore >= 40 ? "text-amber-600 dark:text-amber-400" :
                  "text-rose-600 dark:text-rose-400"
                )}>{thesisAlignment.thesisFitScore}</span>
              </div>
              {thesisAlignment.rationale && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{thesisAlignment.rationale}</p>
              )}
            </div>
          </div>
        )}

        <Card className="bg-primary/[0.04] border-primary/15">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Deal Snapshot
            </CardTitle>
            <p className="text-xs text-muted-foreground">Top highlights for a quick pitch</p>
          </CardHeader>
          <CardContent>
            <MarkdownText className="text-sm leading-relaxed [&>p]:mb-0">{dealSnapshot}</MarkdownText>
          </CardContent>
        </Card>

        {evaluation && (
          <KpiGrid metrics={extractKpiMetrics(startup, evaluation)} />
        )}

        <ExitScenariosCard scenarios={exitScenarios} />

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-primary/[0.04] border-primary/15">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Key Strengths
              </CardTitle>
              <p className="text-xs text-muted-foreground">Synthesis highlights</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {strengths.length > 0
                  ? strengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <MarkdownText className="flex-1 [&>p]:mb-0">{item}</MarkdownText>
                      </li>
                    ))
                  : <li className="text-muted-foreground">No strengths available yet.</li>
                }
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-amber-50/70 border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Key Risks
              </CardTitle>
              <p className="text-xs text-muted-foreground">Synthesis highlights</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {risks.length > 0
                  ? risks.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                        <MarkdownText className="flex-1 [&>p]:mb-0">{item}</MarkdownText>
                      </li>
                    ))
                  : <li className="text-muted-foreground">No risks available yet.</li>
                }
              </ul>
            </CardContent>
          </Card>
        </div>

        {(allGaps.length > 0 || plainGaps.length > 0) && (
          <DataGapsCard
            allGaps={allGaps}
            plainGaps={plainGaps}
            onNavigateTab={onNavigateTab}
          />
        )}

    </div>
  );
}
