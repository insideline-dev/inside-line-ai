import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { StatusBadge } from "@/components/analysis/StatusBadge";
import { mockStartups } from "@/mocks/data/startups";
import { getMockEvaluationByStartupId } from "@/mocks/data/evaluations";
import { ArrowLeft, ExternalLink, MapPin, DollarSign, Users, Building2 } from "lucide-react";

export const Route = createFileRoute("/_protected/investor/startup/$id")({
  component: InvestorStartupDetailPage,
});

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
};

function formatCurrency(amount: number, currency = "USD"): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M ${currency}`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K ${currency}`;
  return `$${amount} ${currency}`;
}

function InvestorStartupDetailPage() {
  const { id } = Route.useParams();
  const startup = mockStartups.find((s) => s.id === Number(id));
  const evaluation = startup ? getMockEvaluationByStartupId(startup.id) : null;

  if (!startup) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Startup not found</h2>
        <Button asChild>
          <Link to="/investor">Back to Deal Flow</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/investor">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{startup.name}</h1>
            {startup.website && (
              <a href={startup.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-5 w-5" />
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={startup.status} />
            {startup.stage && <Badge variant="secondary">{stageLabels[startup.stage]}</Badge>}
            {startup.location && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {startup.location}
              </span>
            )}
          </div>
        </div>
        {evaluation?.overallScore && <ScoreRing score={evaluation.overallScore} size="lg" label="Overall Score" />}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scores">Scores</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Company
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">{startup.description || "No description provided"}</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Sector</span>
                    <p className="font-medium">{startup.sectorIndustry?.replace(/_/g, " ") || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stage</span>
                    <p className="font-medium">{startup.stage ? stageLabels[startup.stage] : "N/A"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Deal Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Round Size</span>
                    <p className="font-medium">{startup.roundSize ? formatCurrency(startup.roundSize, startup.roundCurrency) : "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valuation</span>
                    <p className="font-medium">{startup.valuation ? formatCurrency(startup.valuation, startup.roundCurrency) : "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Raise Type</span>
                    <p className="font-medium">{startup.raiseType?.replace(/_/g, " ").toUpperCase() || "N/A"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lead Secured</span>
                    <p className="font-medium">{startup.leadSecured ? `Yes - ${startup.leadInvestorName}` : "No"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {evaluation && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Key Strengths</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {evaluation.keyStrengths?.map((strength, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-green-500">+</span>
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Key Risks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {evaluation.keyRisks?.map((risk, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-red-500">-</span>
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scores" className="mt-6">
          {evaluation?.sectionScores ? (
            <Card>
              <CardHeader>
                <CardTitle>Section Scores</CardTitle>
                <CardDescription>Detailed breakdown by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.entries(evaluation.sectionScores).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-4">
                      <ScoreRing score={value} size="sm" showLabel={false} />
                      <div>
                        <p className="font-medium capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                        <p className="text-sm text-muted-foreground">{Math.round(value)}/100</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No scores available yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Team Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              {startup.teamMembers?.length ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {startup.teamMembers.map((member, i) => (
                    <div key={i} className="p-4 border rounded-lg">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">{member.role}</p>
                      {member.linkedinUrl && (
                        <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No team members listed</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
