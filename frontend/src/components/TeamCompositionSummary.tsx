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
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { MarkdownText } from "@/components/MarkdownText";

interface TeamComposition {
  hasBusinessLeader?: boolean;
  hasTechnicalLeader?: boolean;
  hasIndustryExpert?: boolean;
  hasOperationsLeader?: boolean;
  teamBalance?: string;
  functionalCoverage?: string;
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
      <SectionScoreCard
        title="Team Score"
        score={teamScore}
        weight={weight}
        confidence={confidence}
        scoringBasis={scoringBasis}
        subScores={subScores}
        dataTestId="card-team-score"
        scoreTestId="text-team-score"
        confidenceTestId="badge-team-confidence"
      />

      <Card className="border-primary/15">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Team Composition
          </CardTitle>
          <CardDescription>Key role coverage assessment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const covered = [teamComposition?.hasBusinessLeader, teamComposition?.hasTechnicalLeader, teamComposition?.hasIndustryExpert, teamComposition?.hasOperationsLeader].filter(Boolean).length;
            return (
              <p className="text-xs font-medium text-muted-foreground">{covered}/4 capabilities covered</p>
            );
          })()}
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
            <MarkdownText className="text-sm text-muted-foreground mt-2 [&>p]:mb-0">
              {teamComposition.teamBalance}
            </MarkdownText>
          )}
          {teamComposition?.functionalCoverage && teamComposition.functionalCoverage !== teamComposition.teamBalance && (
            <MarkdownText className="text-xs text-muted-foreground italic [&>p]:mb-0">
              {teamComposition.functionalCoverage}
            </MarkdownText>
          )}

        </CardContent>
      </Card>

      {(founderMarketFitScore !== null || founderMarketFitWhy) && (
        <Card className="border-primary/15" data-testid="card-founder-market-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Founder-Market Fit
              {founderMarketFitScore !== null && (
                <Badge variant="secondary" className="ml-auto" data-testid="text-fmf-score">
                  {founderMarketFitScore}/100
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {founderMarketFitWhy && (
              <div data-testid="text-fmf-why">
                <MarkdownText className="text-sm text-muted-foreground leading-relaxed [&>p]:mb-0">
                  {founderMarketFitWhy}
                </MarkdownText>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                      <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">{strength}</MarkdownText>
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
                      <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">{risk}</MarkdownText>
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
