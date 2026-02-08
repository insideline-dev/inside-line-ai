import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAdminControllerGetAllScoringWeights } from "@/api/generated/admin/admin";
import { useInvestorControllerGetScoringPreferences } from "@/api/generated/investor/investor";
import type { FundingStage } from "@/types";

export const Route = createFileRoute("/_protected/investor/scoring")({
  component: InvestorScoringPage,
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

const weightLabels: Record<string, string> = {
  team: "Team",
  market: "Market",
  product: "Product",
  traction: "Traction",
  businessModel: "Business Model",
  gtm: "GTM Strategy",
  financials: "Financials",
  competitiveAdvantage: "Competitive Advantage",
  legal: "Legal",
  dealTerms: "Deal Terms",
  exitPotential: "Exit Potential",
};

type StageWeightEntry = { stage: string; weights: Record<string, number>; rationale: Record<string, string>; overallRationale?: string };
type ScoringPref = { stage: string; useCustomWeights: boolean; customWeights?: Record<string, number> | null };

function InvestorScoringPage() {
  const [activeStage, setActiveStage] = useState<FundingStage>("seed");
  const { data: defaultsResponse, isLoading: loadingDefaults, error: defaultsError } = useAdminControllerGetAllScoringWeights();
  const { data: prefsResponse, isLoading: loadingPrefs } = useInvestorControllerGetScoringPreferences();

  const scoringWeights = (defaultsResponse?.data as StageWeightEntry[] | undefined) ?? [];
  const preferences = (prefsResponse?.data as ScoringPref[] | undefined) ?? [];

  const isLoading = loadingDefaults || loadingPrefs;

  const getEffectiveWeights = (stage: string): Record<string, number> | null => {
    const pref = preferences.find((p) => p.stage === stage);
    if (pref?.useCustomWeights && pref.customWeights) {
      return pref.customWeights;
    }
    const defaults = scoringWeights.find((sw) => sw.stage === stage);
    return defaults?.weights ?? null;
  };

  const isCustomized = (stage: string): boolean => {
    const pref = preferences.find((p) => p.stage === stage);
    return pref?.useCustomWeights === true && pref?.customWeights != null;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scoring Preferences</h1>
          <p className="text-muted-foreground">View how startups are scored at each stage</p>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (defaultsError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Scoring Preferences</h1>
          <p className="text-muted-foreground">View how startups are scored at each stage</p>
        </div>
        <div className="text-center py-12 text-destructive">
          Failed to load scoring weights: {(defaultsError as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scoring Preferences</h1>
        <p className="text-muted-foreground">View how startups are scored at each stage</p>
      </div>

      <Tabs value={activeStage} onValueChange={(v) => setActiveStage(v as FundingStage)}>
        <TabsList>
          {scoringWeights.map((sw) => (
            <TabsTrigger key={sw.stage} value={sw.stage}>
              {stageLabels[sw.stage] || sw.stage}
              {isCustomized(sw.stage) && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">Custom</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {scoringWeights.map((sw) => {
          const effective = getEffectiveWeights(sw.stage);
          const customized = isCustomized(sw.stage);

          return (
            <TabsContent key={sw.stage} value={sw.stage} className="mt-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CardTitle>Scoring Weights</CardTitle>
                      {customized && <Badge variant="outline">Custom</Badge>}
                    </div>
                    <CardDescription>
                      {customized
                        ? "You have custom weights for this stage"
                        : sw.overallRationale || "Platform default weights"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {effective && Object.entries(effective).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{weightLabels[key] || key}</span>
                          <span className="font-medium">{value}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Weight Rationale</CardTitle>
                    <CardDescription>Why these weights matter at this stage</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.entries(sw.rationale).slice(0, 5).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <h4 className="font-medium text-sm">{weightLabels[key] || key}</h4>
                        <p className="text-sm text-muted-foreground">{value}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
