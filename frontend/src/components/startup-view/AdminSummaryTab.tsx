import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { CheckCircle2, AlertTriangle, ChevronRight, Link2, Sparkles } from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";

interface AdminSummaryTabProps {
  startup: Startup;
  evaluation?: Evaluation;
  weights?: ScoringWeights | null;
  adminNotes: string;
  onAdminNotesChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  approveDisabled?: boolean;
  rejectDisabled?: boolean;
  canApproveReject: boolean;
}

interface SectionScoreRow {
  id: string;
  label: string;
  score: number;
  weight: number;
}

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

function scoreBarClass(score: number): string {
  if (score >= 85) return "bg-fuchsia-500";
  if (score >= 70) return "bg-violet-600";
  if (score >= 55) return "bg-indigo-600";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

function getSectionRows(evaluation: Evaluation, weights?: ScoringWeights | null): SectionScoreRow[] {
  return [
    { id: "team", label: "Team", score: evaluation.teamScore ?? 0, weight: weights?.team ?? 0 },
    { id: "market", label: "Market", score: evaluation.marketScore ?? 0, weight: weights?.market ?? 0 },
    { id: "product", label: "Product", score: evaluation.productScore ?? 0, weight: weights?.product ?? 0 },
    { id: "traction", label: "Traction", score: evaluation.tractionScore ?? 0, weight: weights?.traction ?? 0 },
    { id: "businessModel", label: "Business Model", score: evaluation.businessModelScore ?? 0, weight: weights?.businessModel ?? 0 },
    { id: "gtm", label: "GTM", score: evaluation.gtmScore ?? 0, weight: weights?.gtm ?? 0 },
    {
      id: "competitiveAdvantage",
      label: "Competitive Advantage",
      score: evaluation.competitiveAdvantageScore ?? 0,
      weight: weights?.competitiveAdvantage ?? 0,
    },
    { id: "financials", label: "Financials", score: evaluation.financialsScore ?? 0, weight: weights?.financials ?? 0 },
    { id: "legal", label: "Legal", score: evaluation.legalScore ?? 0, weight: weights?.legal ?? 0 },
    { id: "dealTerms", label: "Deal Terms", score: evaluation.dealTermsScore ?? 0, weight: weights?.dealTerms ?? 0 },
    { id: "exitPotential", label: "Exit Potential", score: evaluation.exitPotentialScore ?? 0, weight: weights?.exitPotential ?? 0 },
  ];
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function AdminSummaryTab({
  startup,
  evaluation,
  weights,
  adminNotes,
  onAdminNotesChange,
  onApprove,
  onReject,
  approveDisabled,
  rejectDisabled,
  canApproveReject,
}: AdminSummaryTabProps) {
  const score = evaluation?.overallScore ?? startup.overallScore ?? 0;
  const percentile = startup.percentileRank != null ? `Top ${100 - startup.percentileRank}%` : "N/A";
  const strengths = evaluation?.keyStrengths ?? [];
  const risks = evaluation?.keyRisks ?? [];
  const sectionRows = evaluation ? getSectionRows(evaluation, weights) : [];
  const executiveSummary =
    evaluation?.executiveSummary ||
    evaluation?.investorMemo?.executiveSummary ||
    startup.description ||
    "No summary generated yet.";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-5 md:grid-cols-[170px_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center rounded-md border bg-muted/15 py-3">
                <ScoreRing score={score} size="md" showLabel={false} variant="secondary" />
                <p className="mt-2 text-xs font-semibold">{percentile}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <InfoMetric label="Stage" value={formatStage(startup.stage)} />
                <InfoMetric label="Industry Group" value={startup.sectorIndustryGroup || "N/A"} />
                <InfoMetric label="Industry" value={startup.sectorIndustry || startup.industry || "N/A"} />
                <InfoMetric label="Location" value={startup.location || "N/A"} />
                <InfoMetric label="Round Size" value={formatCompactCurrency(startup.fundingTarget)} />
                <InfoMetric label="Valuation (Post-money)" value={formatCompactCurrency(startup.valuation)} />
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
            <p className="text-sm leading-relaxed">{executiveSummary}</p>
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
                  <span className="text-right text-xs font-medium">{row.score}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-notes">Notes</Label>
              <Textarea
                id="admin-notes"
                value={adminNotes}
                onChange={(e) => onAdminNotesChange(e.target.value)}
                placeholder="Add notes about this review..."
                className="min-h-24"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="score-override">Score Override</Label>
              <Input id="score-override" placeholder="Leave empty to use AI score" disabled />
            </div>

            {canApproveReject && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={onApprove} disabled={approveDisabled}>
                  Approve
                </Button>
                <Button variant="destructive" onClick={onReject} disabled={rejectDisabled}>
                  Reject
                </Button>
              </div>
            )}

            <Button variant="ghost" className="w-full text-destructive hover:text-destructive" disabled>
              Delete Submission
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <StatRow label="Score" value={`${score}/100`} />
            <StatRow label="Percentile" value={percentile} />
            <StatRow label="Round" value={formatCompactCurrency(startup.fundingTarget)} />
            <StatRow label="Valuation" value={formatCompactCurrency(startup.valuation)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Links & Docs</CardTitle>
          </CardHeader>
          <CardContent>
            {startup.website ? (
              <a
                href={startup.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <Link2 className="h-4 w-4" />
                Website
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No links available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
