import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FounderInsightCard } from "./FounderInsightCard";
import { 
  CheckCircle, 
  AlertTriangle, 
  ChevronRight,
  Lightbulb,
  Users,
  Target,
  Cpu,
  Building2,
  TrendingUp,
  Megaphone,
  PiggyBank,
  Shield,
  Scale,
  Handshake
} from "lucide-react";
import type { StartupEvaluation } from "@shared/schema";

interface InsightsTabContentProps {
  evaluation: StartupEvaluation | null;
}

function extractInsights(data: any): { 
  strengths: string[]; 
  improvements: string[]; 
  unclearItems: string[] 
} {
  const strengths: string[] = [];
  const improvements: string[] = [];
  const unclearItems: string[] = [];

  if (!data) return { strengths, improvements, unclearItems };

  // Extract strengths
  if (Array.isArray(data.keyStrengths)) {
    strengths.push(...data.keyStrengths.slice(0, 3));
  }
  
  // Extract actionable improvements - prioritize recommendations over risks
  // These are things founders can actually do something about
  const actionableFields = [
    'recommendations',
    'pitchRecommendations', 
    'improvements',
    'actionItems',
    'suggestedActions',
    'founderActions'
  ];
  
  for (const field of actionableFields) {
    if (Array.isArray(data[field]) && improvements.length < 3) {
      improvements.push(...data[field].slice(0, 3 - improvements.length));
    }
  }
  
  // Fallback to risks only if no actionable items found, but reframe them
  if (improvements.length === 0 && Array.isArray(data.keyRisks)) {
    improvements.push(...data.keyRisks.slice(0, 3));
  }

  // Extract unclear/missing items that founders can clarify
  const clarifyFields = ['gapsIdentified', 'missingInfo', 'dataNeeded', 'questionsToAddress'];
  for (const field of clarifyFields) {
    if (Array.isArray(data[field]) && unclearItems.length < 2) {
      unclearItems.push(...data[field].slice(0, 2 - unclearItems.length));
    }
  }

  return { strengths, improvements, unclearItems };
}

export function InsightsTabContent({ evaluation }: InsightsTabContentProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed" data-testid="card-no-insights">
        <CardContent className="p-12 text-center">
          <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2" data-testid="text-no-insights-title">No insights available</h3>
          <p className="text-muted-foreground" data-testid="text-no-insights-message">Your startup is still being evaluated.</p>
        </CardContent>
      </Card>
    );
  }

  const overallStrengths = (evaluation.keyStrengths as string[]) || [];
  const overallRisks = (evaluation.keyRisks as string[]) || [];
  const recommendations = (evaluation.recommendations as string[]) || [];

  const teamInsights = extractInsights(evaluation.teamData);
  const marketInsights = extractInsights(evaluation.marketData);
  const productInsights = extractInsights(evaluation.productData);
  const tractionInsights = extractInsights(evaluation.tractionData);
  const businessModelInsights = extractInsights(evaluation.businessModelData);
  const gtmInsights = extractInsights(evaluation.gtmData);
  const financialsInsights = extractInsights(evaluation.financialsData);
  const competitiveInsights = extractInsights(evaluation.competitiveAdvantageData);
  const legalInsights = extractInsights(evaluation.legalData);
  const dealInsights = extractInsights(evaluation.dealTermsData);

  return (
    <div className="space-y-6" data-testid="container-insights-tab">
      <Card className="bg-primary/5 border-primary/20" data-testid="card-overall-recommendations">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            <span data-testid="text-recommendations-title">Overall Recommendations</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div data-testid="container-founder-strengths">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-4 h-4 text-chart-2" />
                <span className="font-medium text-sm">Your Strengths</span>
              </div>
              <ul className="space-y-2" data-testid="list-founder-strengths">
                {overallStrengths.slice(0, 4).map((strength, i) => (
                  <li key={i} className="text-sm flex items-start gap-2" data-testid={`item-founder-strength-${i}`}>
                    <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-chart-2" />
                    <span>{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div data-testid="container-founder-improvements">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-chart-4" />
                <span className="font-medium text-sm">Ways to Strengthen Your Pitch</span>
              </div>
              <ul className="space-y-2" data-testid="list-founder-improvements">
                {recommendations.length > 0 ? (
                  recommendations.slice(0, 4).map((rec, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" data-testid={`item-founder-improvement-${i}`}>
                      <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-chart-4" />
                      <span>{rec}</span>
                    </li>
                  ))
                ) : (
                  overallRisks.slice(0, 4).map((risk, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" data-testid={`item-founder-improvement-${i}`}>
                      <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-chart-4" />
                      <span>{risk}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <FounderInsightCard
          title="Team"
          icon={Users}
          strengths={teamInsights.strengths}
          improvements={teamInsights.improvements}
          unclearItems={teamInsights.unclearItems}
        />
        <FounderInsightCard
          title="Market Opportunity"
          icon={Target}
          strengths={marketInsights.strengths}
          improvements={marketInsights.improvements}
          unclearItems={marketInsights.unclearItems}
        />
        <FounderInsightCard
          title="Product & Technology"
          icon={Cpu}
          strengths={productInsights.strengths}
          improvements={productInsights.improvements}
          unclearItems={productInsights.unclearItems}
        />
        <FounderInsightCard
          title="Traction & Metrics"
          icon={TrendingUp}
          strengths={tractionInsights.strengths}
          improvements={tractionInsights.improvements}
          unclearItems={tractionInsights.unclearItems}
        />
        <FounderInsightCard
          title="Business Model"
          icon={Building2}
          strengths={businessModelInsights.strengths}
          improvements={businessModelInsights.improvements}
          unclearItems={businessModelInsights.unclearItems}
        />
        <FounderInsightCard
          title="Go-to-Market"
          icon={Megaphone}
          strengths={gtmInsights.strengths}
          improvements={gtmInsights.improvements}
          unclearItems={gtmInsights.unclearItems}
        />
        <FounderInsightCard
          title="Financials"
          icon={PiggyBank}
          strengths={financialsInsights.strengths}
          improvements={financialsInsights.improvements}
          unclearItems={financialsInsights.unclearItems}
        />
        <FounderInsightCard
          title="Competitive Position"
          icon={Shield}
          strengths={competitiveInsights.strengths}
          improvements={competitiveInsights.improvements}
          unclearItems={competitiveInsights.unclearItems}
        />
        <FounderInsightCard
          title="Legal & Regulatory"
          icon={Scale}
          strengths={legalInsights.strengths}
          improvements={legalInsights.improvements}
          unclearItems={legalInsights.unclearItems}
        />
        <FounderInsightCard
          title="Deal Terms"
          icon={Handshake}
          strengths={dealInsights.strengths}
          improvements={dealInsights.improvements}
          unclearItems={dealInsights.unclearItems}
        />
      </div>
    </div>
  );
}
