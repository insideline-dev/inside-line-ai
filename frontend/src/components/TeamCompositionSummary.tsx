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

interface TeamComposition {
  hasBusinessLeader?: boolean;
  hasTechnicalLeader?: boolean;
  hasIndustryExpert?: boolean;
  hasOperationsLeader?: boolean;
  teamBalance?: string;
}

interface TeamCompositionSummaryProps {
  teamScore: number;
  teamComposition?: TeamComposition;
  keyStrengths?: string[];
  keyRisks?: string[];
  weight?: number;
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
          ? "bg-chart-2/10 border-chart-2/30"
          : "bg-chart-5/10 border-chart-5/30"
      }`}
    >
      <Icon className={`w-5 h-5 ${hasRole ? "text-chart-2" : "text-chart-5"}`} />
      <span className="text-sm font-medium flex-1">{label}</span>
      {hasRole ? (
        <CheckCircle2 className="w-4 h-4 text-chart-2" />
      ) : (
        <XCircle className="w-4 h-4 text-chart-5" />
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
}: TeamCompositionSummaryProps) {
  return (
    <div className="space-y-6">
      <Card data-testid="card-team-score">
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
        </CardContent>
      </Card>

      <Card>
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
              label="Operations Leader"
              hasRole={teamComposition?.hasOperationsLeader}
              icon={Settings}
            />
          </div>

          {teamComposition?.teamBalance && (
            <p className="text-sm text-muted-foreground mt-2">
              {teamComposition.teamBalance}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {keyStrengths && keyStrengths.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-chart-2" />
                Team Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {keyStrengths.slice(0, 5).map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-chart-2 shrink-0" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {keyRisks && keyRisks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-chart-5" />
                Team Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {keyRisks.slice(0, 5).map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 text-chart-5 shrink-0" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
