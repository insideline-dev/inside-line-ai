import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2 } from "lucide-react";
import {
  useStartupControllerFindOne,
  useStartupControllerFindApprovedById,
  useStartupControllerGetEvaluation,
  useStartupControllerApprove,
  getStartupControllerFindAllQueryKey,
  getStartupControllerFindOneQueryKey,
} from "@/api/generated/startup/startup";
import {
  useInvestorControllerGetEffectiveWeights,
  useInvestorControllerGetMatchDetails,
  getInvestorControllerGetMatchesQueryKey,
} from "@/api/generated/investor/investor";
import { useToast } from "@/hooks/use-toast";
import {
  StartupHeader,
  SummaryCard,
  MemoTabContent,
  TeamTabContent,
  CompetitorsTabContent,
  ProductTabContent,
  InsightsTabContent,
} from "@/components/startup-view";
import { getDisplayOverallScore } from "@/lib/evaluation-display";

export const Route = createFileRoute("/_protected/investor/startup/$id")({
  component: InvestorStartupDetailPage,
});

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as Record<string, unknown>).data as T;
  }

  return payload as T;
}

function InvestorStartupDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { mutate: approveStartup, isPending: isApproving } = useStartupControllerApprove({
    mutation: {
      onSuccess: () => {
        toast.success("Startup approved successfully");
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getStartupControllerFindAllQueryKey() });
        queryClient.invalidateQueries({ queryKey: getInvestorControllerGetMatchesQueryKey() });
      },
      onError: (error) => {
        toast.error("Failed to approve startup", {
          description: (error as Error).message,
        });
      },
    },
  });

  const {
    data: ownStartupRes,
    isLoading: ownStartupLoading,
  } = useStartupControllerFindOne(id, {
    query: { retry: false },
  });
  const {
    data: approvedStartupRes,
    isLoading: approvedStartupLoading,
    error: approvedStartupError,
  } = useStartupControllerFindApprovedById(id, {
    query: { retry: false },
  });
  const { data: evalRes, isLoading: evalLoading, error: evalError } = useStartupControllerGetEvaluation(id);
  const { data: matchRes } = useInvestorControllerGetMatchDetails(id, {
    query: { retry: false },
  });

  const ownStartup = ownStartupRes
    ? unwrapApiResponse<Record<string, unknown>>(ownStartupRes)
    : undefined;
  const approvedStartup = approvedStartupRes
    ? unwrapApiResponse<Record<string, unknown>>(approvedStartupRes)
    : undefined;
  const startup = ownStartup ?? approvedStartup;
  const startupStage = typeof startup?.stage === "string" ? startup.stage : "";
  const { data: weightsRes } = useInvestorControllerGetEffectiveWeights(startupStage, {
    query: {
      enabled: Boolean(startupStage),
      retry: false,
    },
  });
  const weights = weightsRes
    ? unwrapApiResponse<Record<string, unknown>>(weightsRes)
    : undefined;
  const evaluationFromStartup =
    startup && typeof startup === "object" && "evaluation" in startup
      ? ((startup as { evaluation?: Record<string, unknown> }).evaluation ?? undefined)
      : undefined;
  const evaluation = evalRes
    ? unwrapApiResponse<Record<string, unknown>>(evalRes)
    : evaluationFromStartup;
  const overallScore = getDisplayOverallScore(
    (evaluation as any) ?? null,
    typeof startup?.overallScore === "number" ? startup.overallScore : null,
  );
  const match = matchRes
    ? unwrapApiResponse<Record<string, unknown>>(matchRes)
    : undefined;
  const isLoading = ownStartupLoading || approvedStartupLoading || evalLoading;
  const error = approvedStartupError || evalError;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!startup || (error && !ownStartup)) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Startup not found</h2>
        <Button asChild>
          <Link to="/investor">Back to Pipeline</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StartupHeader
        startup={startup as any}
        backLink="/investor"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {overallScore > 0 ? (
              <ScoreRing score={overallScore} size="lg" label="Overall Score" showLabel />
            ) : null}
            {startup.status === "pending_review" && (
              <Button
                variant="outline"
                className="gap-2 text-chart-2 border-chart-2/40 hover:bg-chart-2/10 hover:text-chart-2"
                onClick={() => approveStartup({ id, data: {} })}
                disabled={isApproving}
                data-testid="button-approve-startup"
              >
                {isApproving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Approve Analysis
              </Button>
            )}
          </div>
        }
      />

      <SummaryCard
        startup={startup as any}
        evaluation={evaluation as any}
        showScores
        showSectionScores
        showRecommendation
        weights={weights as any}
      />

      {(typeof match?.thesisFitScore === "number" || typeof match?.fitRationale === "string") && (
        <Card>
          <CardHeader>
            <CardTitle>Thesis Alignment</CardTitle>
            <CardDescription>How this startup fits your investment thesis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeof match?.thesisFitScore === "number" && (
              <div className="inline-flex items-center gap-3">
                <ScoreRing score={match.thesisFitScore as number} size="sm" showLabel={false} variant="secondary" />
                <span className="text-sm text-muted-foreground">Thesis fit score</span>
              </div>
            )}
            {typeof match?.fitRationale === "string" && match.fitRationale.trim().length > 0 && (
              <p className="text-sm text-muted-foreground">{match.fitRationale as string}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="memo" className="space-y-6">
        <TabsList>
          <TabsTrigger value="memo">Investment Memo</TabsTrigger>
          <TabsTrigger value="product">Product</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="memo">
          {evaluation ? (
            <MemoTabContent startup={startup as any} evaluation={evaluation as any} weights={weights as any} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground">
                Evaluation details are not available yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="product">
          <ProductTabContent startup={startup as any} evaluation={(evaluation as any) ?? null} />
        </TabsContent>

        <TabsContent value="team">
          <TeamTabContent
            evaluation={(evaluation as any) ?? null}
            teamMembers={(startup.teamMembers || []) as any}
            companyName={startup.name as string}
          />
        </TabsContent>

        <TabsContent value="competitors">
          <CompetitorsTabContent
            evaluation={(evaluation as any) ?? null}
            companyName={startup.name as string}
          />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsTabContent evaluation={(evaluation as any) ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
