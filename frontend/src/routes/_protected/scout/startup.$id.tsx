import { createFileRoute, useParams } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import {
  StartupHeader,
  SummaryCard,
  InsightsTabContent,
  ProductTabContent,
  TeamTabContent,
} from "@/components/startup-view";
import {
  useScoutControllerGetMySubmissionStartup,
  useScoutControllerGetMySubmissionMatches,
} from "@/api/generated/scout/scout";
import type { ScoutStartupMatchesResponseDtoDataItem } from "@/api/generated/model";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

export const Route = createFileRoute("/_protected/scout/startup/$id")({
  component: ScoutStartupDetail,
});

interface StartupWithEvaluation extends Startup {
  evaluation?: Evaluation;
}

function formatPercent(score: number | null | undefined): string {
  if (typeof score !== "number") {
    return "N/A";
  }
  return `${score}%`;
}

function ScoutStartupDetail() {
  const { id } = useParams({ from: "/_protected/scout/startup/$id" });

  const {
    data: startupResponse,
    isLoading,
    error,
  } = useScoutControllerGetMySubmissionStartup(id, {
    query: {
      refetchInterval: (query) => {
        const responseData = query.state.data as { data?: unknown } | undefined;
        const startup = responseData?.data
          ? (responseData.data as StartupWithEvaluation)
          : undefined;
        return startup?.status === "analyzing" ? 5000 : false;
      },
    },
  });

  const { data: matchesResponse, isLoading: loadingMatches } =
    useScoutControllerGetMySubmissionMatches(
      id,
      { limit: 3 },
      {
        query: {
          refetchInterval: 15000,
        },
      },
    );

  const startup = startupResponse
    ? (startupResponse.data as unknown as StartupWithEvaluation)
    : null;

  const matches =
    (matchesResponse?.data.data ?? []) as ScoutStartupMatchesResponseDtoDataItem[];

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-destructive">Error loading startup</h2>
        <p className="text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button asChild className="mt-4">
          <a href="/scout">Back to Dashboard</a>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!startup) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Startup not found</h2>
        <Button asChild className="mt-4">
          <a href="/scout">Back to Dashboard</a>
        </Button>
      </div>
    );
  }

  const evaluation = startup.evaluation;

  const teamMembers = (() => {
    const members: Array<{ name: string; role: string; linkedinUrl?: string }> = [];

    if (startup.teamMembers && startup.teamMembers.length > 0) {
      members.push(
        ...startup.teamMembers.map((m) => ({
          name: m.name || "",
          role: m.role || "",
          linkedinUrl: m.linkedinUrl,
        })),
      );
    }

    if (evaluation?.teamMemberEvaluations) {
      evaluation.teamMemberEvaluations.forEach((evalMember) => {
        const existing = members.find(
          (m) => m.name?.toLowerCase() === evalMember.name?.toLowerCase(),
        );
        if (existing) {
          Object.assign(existing, evalMember);
        } else {
          members.push(evalMember);
        }
      });
    }

    return members;
  })();

  return (
    <div className="space-y-6">
      <StartupHeader startup={startup} backLink="/scout" showStatus={true} />

      {startup.status === "analyzing" && (
        <Card>
          <CardContent className="p-6">
            <AnalysisProgressBar startupId={startup.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Investor Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMatches ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-24" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <p className="text-muted-foreground">
              Matches are not ready yet. They will appear after analysis and matching complete.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {matches.map((match) => (
                <div key={match.investorId} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{match.investorName || "Investor"}</p>
                    <Badge variant="secondary">{match.status || "new"}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Overall: {formatPercent(match.overallScore)}</p>
                    <p>Thesis Fit: {formatPercent(match.thesisFitScore)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
          <TabsTrigger value="product" data-testid="tab-product">Product</TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          {evaluation ? (
            <SummaryCard
              startup={startup}
              evaluation={evaluation}
              investorMemo={evaluation.investorMemo as unknown as Record<string, unknown>}
              showScores={false}
              showSectionScores={false}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  {startup.status === "analyzing"
                    ? "Your startup is currently being analyzed."
                    : "Analysis has not been completed yet."}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-6" data-testid="tab-content-insights">
          {evaluation ? (
            <InsightsTabContent evaluation={evaluation} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  Insights will be available once the analysis is complete.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="product" className="space-y-6">
          {evaluation ? (
            <ProductTabContent
              startup={startup}
              evaluation={evaluation}
              productWeight={undefined}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  Product analysis will be available once evaluation completes.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          {evaluation ? (
            <TeamTabContent
              evaluation={evaluation}
              teamMembers={teamMembers}
              teamWeight={undefined}
              companyName={startup.name}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  Team analysis will be available once evaluation completes.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
