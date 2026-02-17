import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  useStartupControllerFindOne,
  useStartupControllerFindApprovedById,
  useStartupControllerGetEvaluation,
} from "@/api/generated/startup/startup";
import { useInvestorControllerGetEffectiveWeights } from "@/api/generated/investor/investor";
import {
  StartupHeader,
  SummaryCard,
  MemoTabContent,
  TeamTabContent,
  CompetitorsTabContent,
  ProductTabContent,
  InsightsTabContent,
} from "@/components/startup-view";

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
  const evaluation = evalRes
    ? unwrapApiResponse<Record<string, unknown>>(evalRes)
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
            {evaluation?.overallScore ? (
              <ScoreRing score={evaluation.overallScore as number} size="lg" label="Overall Score" showLabel />
            ) : null}
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

      <Tabs defaultValue="memo" className="space-y-6">
        <TabsList>
          <TabsTrigger value="memo">Investment Memo</TabsTrigger>
          <TabsTrigger value="product">Product</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="memo">
          <MemoTabContent startup={startup as any} evaluation={evaluation as any} weights={weights as any} />
        </TabsContent>

        <TabsContent value="product">
          <ProductTabContent startup={startup as any} evaluation={evaluation as any} />
        </TabsContent>

        <TabsContent value="team">
          <TeamTabContent
            evaluation={evaluation as any}
            teamMembers={(startup.teamMembers || []) as any}
            companyName={startup.name as string}
          />
        </TabsContent>

        <TabsContent value="competitors">
          <CompetitorsTabContent
            evaluation={evaluation as any}
            companyName={startup.name as string}
          />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsTabContent evaluation={evaluation as any} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
