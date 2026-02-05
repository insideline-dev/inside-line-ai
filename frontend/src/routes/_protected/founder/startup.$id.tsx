import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  StartupHeader,
  SummaryCard,
  InsightsTabContent,
  ProductTabContent,
  TeamTabContent,
} from "@/components/startup-view";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

export const Route = createFileRoute("/_protected/founder/startup/$id")({
  component: StartupDetail,
});

interface StartupWithEvaluation extends Startup {
  evaluation?: Evaluation;
}

function StartupDetail() {
  const { id } = useParams({ from: "/_protected/founder/startup/$id" });

  const { data: startup, isLoading, error } = useQuery<StartupWithEvaluation>({
    queryKey: ["/api/startups", id],
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "analyzing" ? 5000 : false;
    },
  });

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-destructive">Error loading startup</h2>
        <p className="text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button asChild className="mt-4">
          <a href="/founder">Back to Dashboard</a>
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
          <a href="/founder">Back to Dashboard</a>
        </Button>
      </div>
    );
  }

  const evaluation = startup.evaluation;

  // Extract team members from various sources
  const teamMembers = (() => {
    const members: any[] = [];

    // First, add submitted team members
    if (startup.teamMembers && startup.teamMembers.length > 0) {
      members.push(...startup.teamMembers.map(m => ({
        name: m.name,
        role: m.role,
        linkedinUrl: m.linkedinUrl,
      })));
    }

    // Then merge in evaluation data if available
    if (evaluation?.teamMemberEvaluations) {
      evaluation.teamMemberEvaluations.forEach(evalMember => {
        const existing = members.find(m => m.name?.toLowerCase() === evalMember.name?.toLowerCase());
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
      <StartupHeader
        startup={startup}
        backLink="/founder"
        showStatus={true}
      />

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
              investorMemo={evaluation.investorMemo as any}
              showScores={false}
              showSectionScores={false}
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  {startup.status === "analyzing"
                    ? "Your startup is currently being analyzed. This may take a few minutes."
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
                  Product analysis will be available once the evaluation is complete.
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
            />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">
                  Team analysis will be available once the evaluation is complete.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
