import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Users,
  Briefcase,
  Code,
  Building2,
  Settings,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

interface TeamComposition {
  hasBusinessLeader?: boolean;
  hasTechnicalLeader?: boolean;
  hasIndustryExpert?: boolean;
  hasOperationsLeader?: boolean;
  teamBalance?: string;
}

interface SubScoreItem {
  dimension: string;
  weight: number;
  score: number;
}

interface TeamCompositionSummaryProps {
  teamScore: number;
  teamComposition?: TeamComposition;
  keyStrengths?: string[];
  keyRisks?: string[];
  weight?: number;
  confidence?: string;
  founderMarketFit?: {
    score?: number;
    why?: string;
  };
  subScores?: SubScoreItem[];
  scoringBasis?: string;
}

function RoleIndicator({
  label,
  hasRole,
  icon: Icon,
}: {
  label: string;
  hasRole: boolean | undefined;
  icon: any;
}) {
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg border ${
        hasRole
          ? "bg-emerald-500/10 border-emerald-400/35"
          : "bg-rose-500/10 border-rose-400/35"
      }`}
    >
      <Icon className={`w-5 h-5 ${hasRole ? "text-emerald-600" : "text-rose-500"}`} />
      <span className="text-sm font-medium flex-1">{label}</span>
      {hasRole ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-500" />
      )}
    </div>
  );
}

function scoreBarTone(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-rose-500";
}

function formatWeight(value: number): string {
  const pct = value <= 1 ? value * 100 : value;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

export function TeamCompositionSummary({
  teamScore,
  teamComposition,
  keyStrengths,
  keyRisks,
  weight,
  confidence = "unknown",
  founderMarketFit,
  subScores,
  scoringBasis,
}: TeamCompositionSummaryProps) {
  const founderMarketFitScore =
    typeof founderMarketFit?.score === "number" ? Math.round(founderMarketFit.score) : null;
  const founderMarketFitWhy = founderMarketFit?.why?.trim() || "";

  return (
    <div className="space-y-6">
      <Card
        className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background"
        data-testid="card-team-score"
      >
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Team Score</h3>
                <p className="text-sm text-muted-foreground">
                  {weight !== undefined ? `${weight}%` : ""} weight in overall
                  evaluation
                </p>
                <ConfidenceBadge
                  confidence={confidence}
                  className="mt-2"
                  dataTestId="badge-team-confidence"
                />
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-4xl font-bold ${
                  teamScore >= 80
                    ? "text-green-600"
                    : teamScore >= 60
                    ? "text-amber-600"
                    : "text-red-600"
                }`}
                data-testid="text-team-score"
              >
                {teamScore}
              </span>
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
          </div>

          {(scoringBasis || (subScores && subScores.length > 0)) && (
            <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
              {scoringBasis && <p className="text-sm text-muted-foreground">{scoringBasis}</p>}
              {subScores && subScores.length > 0 && (
                <div className="space-y-3">
                  {subScores.map((item) => (
                <div key={item.dimension} className="grid grid-cols-[minmax(0,1fr)_48px] gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">{item.dimension}</span>
                      <span className="text-muted-foreground">{formatWeight(item.weight)}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted">
                      <div className={`h-full rounded-full ${scoreBarTone(item.score)}`} style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
                    </div>
                  </div>
                  <div className="text-right text-xs font-medium">{Math.round(item.score)}</div>
                </div>
              ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Composition
          </CardTitle>
          <CardDescription>Key role coverage assessment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <RoleIndicator
              label="Business/CEO Leader"
              hasRole={teamComposition?.hasBusinessLeader}
              icon={Briefcase}
            />
            <RoleIndicator
              label="Technical/CTO Leader"
              hasRole={teamComposition?.hasTechnicalLeader}
              icon={Code}
            />
            <RoleIndicator
              label="Industry Expert"
              hasRole={teamComposition?.hasIndustryExpert}
              icon={Building2}
            />
            <RoleIndicator
              label="GTM Capability"
              hasRole={teamComposition?.hasOperationsLeader}
              icon={Settings}
            />
          </div>

          {teamComposition?.teamBalance && (
            <p className="text-sm text-muted-foreground mt-2">
              {teamComposition.teamBalance}
            </p>
          )}

          {(founderMarketFitScore !== null || founderMarketFitWhy) && (
            <div
              className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2"
              data-testid="card-founder-market-fit-inline"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">Founder-Market Fit</p>
                {founderMarketFitScore !== null && (
                  <Badge variant="secondary" data-testid="text-fmf-score">
                    {founderMarketFitScore}/100
                  </Badge>
                )}
              </div>
              {founderMarketFitWhy && (
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-fmf-why">
                  {founderMarketFitWhy}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Team Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {keyStrengths && keyStrengths.length > 0 ? (
                <ul className="space-y-2">
                  {keyStrengths.slice(0, 5).map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No team strengths were identified in this run.</p>
              )}
            </CardContent>
          </Card>

        <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Team Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {keyRisks && keyRisks.length > 0 ? (
                <ul className="space-y-2">
                  {keyRisks.slice(0, 5).map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-rose-500 shrink-0" />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No explicit team risks were identified in this run.</p>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
