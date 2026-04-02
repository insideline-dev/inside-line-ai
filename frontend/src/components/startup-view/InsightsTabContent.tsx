import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FounderInsightCard } from "./FounderInsightCard";
import {
  CheckCircle,
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
import type { Evaluation } from "@/types/evaluation";
import { MarkdownText } from "@/components/MarkdownText";

interface InsightsTabContentProps {
  evaluation: Evaluation | null;
}

function toInsightText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.bullet === "string" && record.bullet.trim()) {
    return record.bullet.trim();
  }
  if (typeof record.recommendation === "string" && record.recommendation.trim()) {
    const missing =
      typeof record.deckMissingElement === "string" &&
      record.deckMissingElement.trim().length > 0
        ? `${record.deckMissingElement.trim()}: `
        : "";
    return `${missing}${record.recommendation.trim()}`;
  }
  if (typeof record.deckMissingElement === "string" && record.deckMissingElement.trim()) {
    return record.deckMissingElement.trim();
  }

  return "";
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
    'founderRecommendations',
    'founderPitchRecommendations',
    'recommendations',
    'pitchRecommendations',
    'improvements',
    'actionItems',
    'suggestedActions',
    'founderActions',
  ];
  
  for (const field of actionableFields) {
    if (Array.isArray(data[field]) && improvements.length < 3) {
      const actionable = (data[field] as unknown[])
        .map((item) => toInsightText(item))
        .filter((item) => item.length > 0);
      improvements.push(...actionable.slice(0, 3 - improvements.length));
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
  const risks = (evaluation.keyRisks as string[]) || [];

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
  const insightSections = [
    { title: "Team", icon: Users, data: teamInsights },
    { title: "Market Opportunity", icon: Target, data: marketInsights },
    { title: "Product & Technology", icon: Cpu, data: productInsights },
    { title: "Traction & Metrics", icon: TrendingUp, data: tractionInsights },
    { title: "Business Model", icon: Building2, data: businessModelInsights },
    { title: "Go-to-Market", icon: Megaphone, data: gtmInsights },
    { title: "Financials", icon: PiggyBank, data: financialsInsights },
    { title: "Competitive Position", icon: Shield, data: competitiveInsights },
    { title: "Legal & Regulatory", icon: Scale, data: legalInsights },
    { title: "Deal Terms", icon: Handshake, data: dealInsights },
  ].filter(
    ({ data }) =>
      data.strengths.length > 0 ||
      data.improvements.length > 0 ||
      data.unclearItems.length > 0,
  );

  return (
    <div className="space-y-6" data-testid="container-insights-tab">
      <Card className="bg-primary/5 border-primary/20" data-testid="card-overall-risks">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="w-5 h-5" />
            <span data-testid="text-risks-title">Key Risks</span>
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
                    <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                      {strength}
                    </MarkdownText>
                  </li>
                ))}
              </ul>
            </div>
            <div data-testid="container-founder-improvements">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-chart-4" />
                <span className="font-medium text-sm">Ways to Strengthen Your Pitch</span>
              </div>
              <ul className="space-y-2" data-testid="list-key-risks">
                {risks.length > 0 ? (
                  risks.slice(0, 4).map((risk, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" data-testid={`item-key-risk-${i}`}>
                      <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-chart-4" />
                      <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                        {risk}
                      </MarkdownText>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground" data-testid="text-no-risks">No key risks identified.</li>
                )}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {insightSections.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {insightSections.map((section) => (
            <FounderInsightCard
              key={section.title}
              title={section.title}
              icon={section.icon}
              strengths={section.data.strengths}
              improvements={section.data.improvements}
              unclearItems={section.data.unclearItems}
            />
          ))}
        </div>
      )}
    </div>
  );
}
