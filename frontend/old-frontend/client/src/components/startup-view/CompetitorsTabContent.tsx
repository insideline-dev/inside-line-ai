import { Card, CardContent } from "@/components/ui/card";
import { CompetitorAnalysis } from "@/components/CompetitorAnalysis";
import { Swords } from "lucide-react";
import type { StartupEvaluation } from "@shared/schema";

interface CompetitorsTabContentProps {
  evaluation: StartupEvaluation | null;
  companyName: string;
  showScores?: boolean;
}

export function CompetitorsTabContent({ 
  evaluation, 
  companyName,
  showScores = true 
}: CompetitorsTabContentProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed" data-testid="card-no-competitors">
        <CardContent className="p-12 text-center">
          <Swords className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2" data-testid="text-no-competitors-title">No competitive analysis</h3>
          <p className="text-muted-foreground" data-testid="text-no-competitors-message">Competitor data has not been analyzed yet.</p>
        </CardContent>
      </Card>
    );
  }

  const competitiveData = evaluation.competitiveAdvantageData as any;

  return (
    <div data-testid="container-competitor-analysis">
      <CompetitorAnalysis
        productDefinition={competitiveData?.productDefinition}
        directCompetitors={competitiveData?.competitorProfiles || []}
        indirectCompetitors={competitiveData?.indirectCompetitorProfiles || []}
        marketLandscape={competitiveData?.marketLandscape}
        sourceSummary={competitiveData?.sourceSummary}
        companyName={companyName}
        basicLandscape={competitiveData?.competitorLandscape}
        positioning={competitiveData?.positioning}
        competitivePositioning={competitiveData?.competitivePositioning}
        barriersToEntry={competitiveData?.barriersToEntry}
        keyStrengths={competitiveData?.keyStrengths || []}
        keyRisks={competitiveData?.keyRisks || []}
        competitiveAdvantageScore={showScores ? evaluation.competitiveAdvantageScore : undefined}
      />
    </div>
  );
}
