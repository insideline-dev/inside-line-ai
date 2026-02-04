import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { StatusBadge } from "@/components/analysis/StatusBadge";
import { getMockStartupById } from "@/mocks/data/startups";
import { ChevronLeft, ExternalLink, MapPin, DollarSign, Users, Calendar, Building2 } from "lucide-react";

export const Route = createFileRoute("/_protected/founder/startup/$id")({
  component: StartupDetail,
});

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f_plus: "Series F+",
};

const raiseTypeLabels: Record<string, string> = {
  safe: "SAFE",
  convertible_note: "Convertible Note",
  equity: "Equity",
  safe_equity: "SAFE + Equity",
  undecided: "Undecided",
};

function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function StartupDetail() {
  const { id } = useParams({ from: "/_protected/founder/startup/$id" });
  const startup = getMockStartupById(Number(id));

  if (!startup) {
    return (
      <div className="max-w-7xl mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Startup Not Found</h1>
        <p className="text-muted-foreground mb-6">The startup you're looking for doesn't exist.</p>
        <Button asChild>
          <Link to="/founder">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/founder">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight">{startup.name}</h1>
              {startup.website && (
                <a
                  href={startup.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={startup.status} />
              {startup.stage && <Badge variant="secondary">{stageLabels[startup.stage]}</Badge>}
              {startup.isPrivate && <Badge variant="outline">Private</Badge>}
            </div>
          </div>

          {startup.overallScore && (
            <ScoreRing score={startup.overallScore} size="lg" showLabel label="Overall Score" />
          )}
        </div>
      </div>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="progress">Analysis Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {startup.description && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Description</h4>
                  <p className="text-muted-foreground">{startup.description}</p>
                </div>
              )}

              <Separator />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">Location</h4>
                    <p className="text-muted-foreground">{startup.location || "Not specified"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">Industry</h4>
                    <p className="text-muted-foreground">
                      {startup.sectorIndustry?.replace(/_/g, " ") || "Not specified"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">Submitted</h4>
                    <p className="text-muted-foreground">{formatDate(startup.createdAt)}</p>
                  </div>
                </div>

                {startup.updatedAt && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold">Last Updated</h4>
                      <p className="text-muted-foreground">{formatDate(startup.updatedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deal Terms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">Round Size</h4>
                    <p className="text-muted-foreground">
                      {startup.roundSize ? formatCurrency(startup.roundSize, startup.roundCurrency) : "Not specified"}
                    </p>
                  </div>
                </div>

                {startup.valuation && (
                  <div className="flex items-start gap-3">
                    <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold">Valuation</h4>
                      <p className="text-muted-foreground">
                        {formatCurrency(startup.valuation, startup.roundCurrency)}
                        {startup.valuationType && ` (${startup.valuationType.replace(/_/g, " ")})`}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-semibold mb-1">Raise Type</h4>
                  <p className="text-muted-foreground">{startup.raiseType ? raiseTypeLabels[startup.raiseType] : "Not specified"}</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-1">Lead Status</h4>
                  <p className="text-muted-foreground">
                    {startup.leadSecured ? `Secured: ${startup.leadInvestorName}` : "Not secured"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {startup.teamMembers && startup.teamMembers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team
                </CardTitle>
                <CardDescription>{startup.teamMembers.length} team member{startup.teamMembers.length !== 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {startup.teamMembers.map((member, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                      {member.linkedinUrl && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={member.linkedinUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Progress</CardTitle>
              <CardDescription>Track the status of your startup analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <p>Analysis progress tracking coming soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
