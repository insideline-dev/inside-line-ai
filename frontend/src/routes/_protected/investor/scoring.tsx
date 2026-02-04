import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockStageScoringWeights } from "@/mocks/data/scoring-weights";
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

function InvestorScoringPage() {
  const [activeStage, setActiveStage] = useState<FundingStage>("seed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Scoring Preferences</h1>
        <p className="text-muted-foreground">View how startups are scored at each stage</p>
      </div>

      <Tabs value={activeStage} onValueChange={(v) => setActiveStage(v as FundingStage)}>
        <TabsList>
          {mockStageScoringWeights.map((sw) => (
            <TabsTrigger key={sw.stage} value={sw.stage}>
              {stageLabels[sw.stage] || sw.stage}
            </TabsTrigger>
          ))}
        </TabsList>

        {mockStageScoringWeights.map((sw) => (
          <TabsContent key={sw.stage} value={sw.stage} className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Scoring Weights</CardTitle>
                  <CardDescription>{sw.overallRationale}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(sw.weights).map(([key, value]) => (
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
        ))}
      </Tabs>
    </div>
  );
}
