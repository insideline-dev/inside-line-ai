import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb } from "lucide-react";
import type { Evaluation, FounderPitchRecommendation, FounderRecommendation } from "@/types/evaluation";

interface FounderRecommendationsTabProps {
  evaluation: Evaluation | null;
}

const SECTION_LABELS: Record<string, string> = {
  teamData: "Team",
  marketData: "Market",
  productData: "Product",
  tractionData: "Traction",
  businessModelData: "Business Model",
  gtmData: "Go-to-Market",
  financialsData: "Financials",
  competitiveAdvantageData: "Competitive Advantage",
  legalData: "Legal",
  dealTermsData: "Deal Terms",
  exitPotentialData: "Exit Potential",
};

const PITCH_REC_SECTIONS = [
  "teamData",
  "marketData",
  "productData",
  "tractionData",
  "businessModelData",
  "gtmData",
  "financialsData",
  "competitiveAdvantageData",
  "legalData",
  "dealTermsData",
  "exitPotentialData",
] as const;

function toPitchRecs(value: unknown): FounderPitchRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is FounderPitchRecommendation =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).deckMissingElement === "string",
  );
}

function toFounderRecs(value: unknown): FounderRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is FounderRecommendation =>
      item !== null && typeof item === "object" && typeof (item as Record<string, unknown>).bullet === "string",
  );
}

export function FounderRecommendationsTab({ evaluation }: FounderRecommendationsTabProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center">
          <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            Recommendations will be available once the evaluation is complete.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sections = PITCH_REC_SECTIONS.map((key) => {
    const sectionData = (evaluation[key] as Record<string, unknown> | undefined) ?? {};
    const pitchRecs = toPitchRecs(sectionData.founderPitchRecommendations);
    const founderRecs = toFounderRecs(sectionData.founderRecommendations);
    return { key, label: SECTION_LABELS[key], pitchRecs, founderRecs };
  }).filter(({ pitchRecs, founderRecs }) => pitchRecs.length > 0 || founderRecs.length > 0);

  if (sections.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center">
          <Lightbulb className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            No founder recommendations were generated for this evaluation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {sections.map(({ key, label, pitchRecs, founderRecs }) => (
        <div key={key} className="space-y-4">
          <h3 className="text-base font-semibold">{label}</h3>

          {pitchRecs.map((rec, i) => (
            <Card key={`pitch-${i}`} className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{rec.deckMissingElement}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {rec.whyItMatters && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {rec.whyItMatters}
                  </p>
                )}
                {rec.recommendation && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-sm leading-relaxed">{rec.recommendation}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {founderRecs.map((rec, i) => (
            <Card key={`founder-${i}`} className="border-primary/20">
              <CardContent className="flex items-start gap-3 py-4">
                <Badge
                  variant={rec.type === "hire" ? "default" : "secondary"}
                  className="shrink-0 capitalize"
                >
                  {rec.type}
                </Badge>
                <p className="text-sm leading-relaxed">{rec.bullet}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
