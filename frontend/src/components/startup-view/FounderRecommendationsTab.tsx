import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  FileWarning,
  Zap,
  Users,
  Target,
  Cpu,
  TrendingUp,
  Building2,
  Megaphone,
  PiggyBank,
  Swords,
  Scale,
  Handshake,
  LogOut,
} from "lucide-react";
import type {
  Evaluation,
  FounderPitchRecommendation,
  FounderRecommendation,
  FounderReport,
} from "@/types/evaluation";
import { MarkdownText } from "@/components/MarkdownText";
import { cn } from "@/lib/utils";

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

const SECTION_ICONS: Record<string, typeof Users> = {
  teamData: Users,
  marketData: Target,
  productData: Cpu,
  tractionData: TrendingUp,
  businessModelData: Building2,
  gtmData: Megaphone,
  financialsData: PiggyBank,
  competitiveAdvantageData: Swords,
  legalData: Scale,
  dealTermsData: Handshake,
  exitPotentialData: LogOut,
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

function RecTypeBadge({ type }: { type: FounderRecommendation["type"] }) {
  return (
    <Badge
      variant={type === "hire" ? "default" : "outline"}
      className={cn(
        "shrink-0 capitalize text-[11px] font-medium",
        type === "hire" && "bg-primary/90",
        type === "reframe" && "border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400",
      )}
    >
      {type}
    </Badge>
  );
}

export function FounderRecommendationsTab({ evaluation }: FounderRecommendationsTabProps) {
  if (!evaluation) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-12 text-center">
          <Lightbulb className="size-12 mx-auto text-muted-foreground mb-4" />
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
          <Lightbulb className="size-12 mx-auto text-muted-foreground mb-4" />
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

  const totalDeckGaps = sections.reduce((sum, s) => sum + s.pitchRecs.length, 0);
  const totalActionItems = sections.reduce((sum, s) => sum + s.founderRecs.length, 0);

  return (
    <div className="space-y-6">
      {/* Founder Report Hero */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
              <Lightbulb className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg text-balance">Founder Report</CardTitle>
              <CardDescription>Personalized insights from your AI evaluation</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <MarkdownText className="text-sm text-muted-foreground leading-relaxed text-pretty [&>p]:mb-0">
            {founderReportData?.summary || "Founder report summary is not available yet."}
          </MarkdownText>

          {(whatsWorking.length > 0 || pathToInevitability.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {whatsWorking.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      What&apos;s Working
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {whatsWorking.map((item, index) => (
                      <li key={`w-${index}`} className="flex items-start gap-2.5 text-sm text-emerald-900 dark:text-emerald-200">
                        <span className="mt-2 size-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-pretty">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pathToInevitability.length > 0 && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRight className="size-4 text-violet-600 dark:text-violet-400" />
                    <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                      Path to Inevitability
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {pathToInevitability.map((item, index) => (
                      <li key={`p-${index}`} className="flex items-start gap-2.5 text-sm text-violet-900 dark:text-violet-200">
                        <span className="mt-2 size-1.5 rounded-full bg-violet-500 shrink-0" />
                        <span className="text-pretty">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {whatsWorking.length === 0 && pathToInevitability.length === 0 && !founderReportData?.summary && (
            <p className="text-sm text-muted-foreground">
              Founder report details are not available yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats Bar */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <FileWarning className="size-3.5" />
            <span className="font-medium tabular-nums text-foreground">{totalDeckGaps}</span>
            {" "}deck {totalDeckGaps === 1 ? "gap" : "gaps"}
          </span>
          <span className="text-border">·</span>
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5" />
            <span className="font-medium tabular-nums text-foreground">{totalActionItems}</span>
            {" "}action {totalActionItems === 1 ? "item" : "items"}
          </span>
          <span className="text-border">·</span>
          <span>
            across <span className="font-medium tabular-nums text-foreground">{sections.length}</span> sections
          </span>
        </div>
      </div>

      {/* Section Recommendations */}
      <div className="space-y-3">
        {sections.map((section, sectionIndex) => (
          <SectionCollapsible
            key={section.key}
            sectionKey={section.key}
            label={section.label}
            pitchRecs={section.pitchRecs}
            founderRecs={section.founderRecs}
            defaultOpen={sectionIndex < 2}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section Collapsible                                                 */
/* ------------------------------------------------------------------ */

interface SectionCollapsibleProps {
  sectionKey: string;
  label: string;
  pitchRecs: FounderPitchRecommendation[];
  founderRecs: FounderRecommendation[];
  defaultOpen: boolean;
}

function SectionCollapsible({ sectionKey, label, pitchRecs, founderRecs, defaultOpen }: SectionCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = SECTION_ICONS[sectionKey] ?? Lightbulb;
  const totalRecs = pitchRecs.length + founderRecs.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={cn("transition-colors duration-150", open && "border-primary/20")}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 rounded-xl transition-colors duration-150"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center size-8 rounded-lg bg-muted shrink-0">
                <Icon className="size-4 text-muted-foreground" />
              </div>
              <span className="font-semibold text-sm truncate">{label}</span>
              <Badge variant="secondary" className="shrink-0 tabular-nums text-[11px]">
                {totalRecs}
              </Badge>
            </div>
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {/* Deck Gaps */}
            {pitchRecs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileWarning className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Deck Gaps
                  </span>
                </div>
                {pitchRecs.map((rec, i) => (
                  <div
                    key={`pitch-${i}`}
                    className="rounded-lg border border-amber-200/60 bg-amber-50/30 p-3.5 space-y-2.5 dark:border-amber-900/40 dark:bg-amber-950/20"
                  >
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="shrink-0 text-[10px] font-medium border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                        Deck Gap
                      </Badge>
                      <span className="text-sm font-medium text-balance">{rec.deckMissingElement}</span>
                    </div>
                    {rec.whyItMatters && (
                      <MarkdownText className="text-sm text-muted-foreground leading-relaxed text-pretty [&>p]:mb-0">
                        {rec.whyItMatters}
                      </MarkdownText>
                    )}
                    {rec.recommendation && (
                      <div className="rounded-md bg-background border px-3 py-2.5">
                        <MarkdownText className="text-sm leading-relaxed text-pretty [&>p]:mb-0">
                          {rec.recommendation}
                        </MarkdownText>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Separator between deck gaps and action items */}
            {pitchRecs.length > 0 && founderRecs.length > 0 && (
              <Separator />
            )}

            {/* Action Items */}
            {founderRecs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="size-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Action Items
                  </span>
                </div>
                <div className="space-y-2">
                  {founderRecs.map((rec, i) => (
                    <div
                      key={`founder-${i}`}
                      className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3.5 py-3"
                    >
                      <RecTypeBadge type={rec.type} />
                      <MarkdownText className="text-sm leading-relaxed text-pretty [&>p]:mb-0">
                        {rec.bullet}
                      </MarkdownText>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
