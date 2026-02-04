import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockStageScoringWeights } from "@/mocks/data/scoring-weights";
import type { ScoringWeights } from "@/types";

export const Route = createFileRoute("/_protected/admin/scoring")({
  component: ScoringWeightsManagement,
});

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C+",
};

const categoryLabels: Record<keyof ScoringWeights, string> = {
  team: "Team",
  market: "Market",
  product: "Product",
  traction: "Traction",
  businessModel: "Business Model",
  gtm: "Go-to-Market",
  financials: "Financials",
  competitiveAdvantage: "Competitive Advantage",
  legal: "Legal",
  dealTerms: "Deal Terms",
  exitPotential: "Exit Potential",
};

function ScoringWeightsManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scoring Weights</h1>
        <p className="text-muted-foreground">
          Manage evaluation criteria weights for different funding stages
        </p>
      </div>

      <Tabs defaultValue="seed" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          {mockStageScoringWeights.map((stage) => (
            <TabsTrigger key={stage.stage} value={stage.stage}>
              {stageLabels[stage.stage] || stage.stage}
            </TabsTrigger>
          ))}
        </TabsList>

        {mockStageScoringWeights.map((stage) => (
          <TabsContent key={stage.stage} value={stage.stage}>
            <Card>
              <CardHeader>
                <CardTitle>
                  {stageLabels[stage.stage] || stage.stage} Stage Weights
                </CardTitle>
                {stage.overallRationale && (
                  <p className="text-sm text-muted-foreground">{stage.overallRationale}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(stage.weights).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {categoryLabels[key as keyof ScoringWeights]}
                        </span>
                        <span className="text-muted-foreground">{value}%</span>
                      </div>
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full bg-primary rounded-full"
                          style={{ width: `${value}%` }}
                        />
                      </div>
                      {stage.rationale[key as keyof ScoringWeights] && (
                        <p className="text-xs text-muted-foreground">
                          {stage.rationale[key as keyof ScoringWeights]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
