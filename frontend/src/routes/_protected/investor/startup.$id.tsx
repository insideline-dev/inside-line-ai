import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  useStartupControllerFindApprovedById,
  useStartupControllerGetEvaluation,
} from "@/api/generated/startup/startup";
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

function InvestorStartupDetailPage() {
  const { id } = Route.useParams();
  const { data: startupRes, isLoading: startupLoading, error: startupError } = useStartupControllerFindApprovedById(id);
  const { data: evalRes, isLoading: evalLoading, error: evalError } = useStartupControllerGetEvaluation(id);

  // Extract data from responses (cast to any due to OpenAPI void response types)
  const startup = startupRes?.data as Record<string, unknown> | undefined;
  const evaluation = evalRes?.data as Record<string, unknown> | undefined;
  const isLoading = startupLoading || evalLoading;
  const error = startupError || evalError;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!startup || error) {
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
      <StartupHeader
        startup={startup as any}
        backLink="/investor"
        actions={
          evaluation?.overallScore ? (
            <ScoreRing score={evaluation.overallScore as number} size="lg" label="Overall Score" showLabel />
          ) : null
        }
      />

      <SummaryCard
        startup={startup as any}
        evaluation={evaluation as any}
        showScores
        showSectionScores
        showRecommendation
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
          <MemoTabContent startup={startup as any} evaluation={evaluation as any} />
        </TabsContent>

        <TabsContent value="product">
          <ProductTabContent startup={startup as any} evaluation={evaluation as any} />
        </TabsContent>

        <TabsContent value="team">
          <TeamTabContent
            evaluation={evaluation as any}
            teamMembers={(startup.teamMembers || []) as any}
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
