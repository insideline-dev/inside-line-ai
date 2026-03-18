import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, CheckCircle2, ArrowRight } from "lucide-react";
import type { Evaluation, FounderPitchRecommendation, FounderRecommendation, FounderReport } from "@/types/evaluation";
import { MarkdownText } from "@/components/MarkdownText";

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

  const founderReportData = (evaluation?.founderReport ?? null) as FounderReport | null;
  const whatsWorking = founderReportData?.whatsWorking?.filter((s) => s.trim().length > 0) ?? [];
  const pathToInevitability = founderReportData?.pathToInevitability?.filter((s) => s.trim().length > 0) ?? [];

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Founder Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MarkdownText className="text-sm text-muted-foreground [&>p]:mb-0">
            {founderReportData?.summary || "Founder report summary is not available yet."}
          </MarkdownText>

          {whatsWorking.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                What&apos;s Working
              </div>
              <ul className="space-y-1.5">
                {whatsWorking.map((item, index) => (
                  <li key={`w-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pathToInevitability.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-violet-700 dark:text-violet-400">
                <ArrowRight className="h-4 w-4" />
                Path to Inevitability
              </div>
              <ul className="space-y-1.5">
                {pathToInevitability.map((item, index) => (
                  <li key={`p-${index}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {whatsWorking.length === 0 && pathToInevitability.length === 0 && !founderReportData?.summary && (
            <p className="text-sm text-muted-foreground">
              Founder report details are not available yet.
            </p>
          )}
        </CardContent>
      </Card>

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
                  <MarkdownText className="text-sm text-muted-foreground leading-relaxed [&>p]:mb-0">
                    {rec.whyItMatters}
                  </MarkdownText>
                )}
                {rec.recommendation && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <MarkdownText className="text-sm leading-relaxed [&>p]:mb-0">{rec.recommendation}</MarkdownText>
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
                <MarkdownText className="text-sm leading-relaxed [&>p]:mb-0">{rec.bullet}</MarkdownText>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}
