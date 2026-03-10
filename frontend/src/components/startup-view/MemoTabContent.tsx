import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { MemoSection } from "@/components/MemoSection";
import {
  FileText,
  Users,
  Target,
  Cpu,
  Building2,
  TrendingUp,
  Megaphone,
  PiggyBank,
  Scale,
  Handshake,
  LogOut,
  Swords,
  Search,
  Download,
  ExternalLink,
} from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface MemoSectionSource {
  label: string;
  url: string;
}

interface InvestorMemoSection {
  title: string;
  content: string;
  highlights?: string[];
  concerns?: string[];
  sources?: MemoSectionSource[];
}

interface InvestorMemo {
  executiveSummary?: string;
  sections?: InvestorMemoSection[];
  keyDueDiligenceAreas?: string[];
}

interface AdminFeedbackHandler {
  onReanalyze: (sectionKey: string, evaluationId: string, comment: string) => Promise<void>;
  reanalyzingSection: string | null;
}

interface ScoringWeights {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

interface MemoTabContentProps {
  startup: Startup;
  evaluation: Evaluation;
  investorMemo?: InvestorMemo | null;
  adminFeedback?: AdminFeedbackHandler;
  showScores?: boolean;
  weights?: ScoringWeights | null;
  animateOnMount?: boolean;
}

type MemoScoreKey =
  | "teamScore"
  | "marketScore"
  | "productScore"
  | "businessModelScore"
  | "tractionScore"
  | "gtmScore"
  | "competitiveAdvantageScore"
  | "financialsScore"
  | "legalScore"
  | "dealTermsScore"
  | "exitPotentialScore";

const SECTION_CONFIG: Array<{
  key:
    | "team"
    | "market"
    | "product"
    | "businessModel"
    | "traction"
    | "gtm"
    | "competitiveAdvantage"
    | "financials"
    | "legal"
    | "dealTerms"
    | "exitPotential";
  title: string;
  icon: typeof Users;
  scoreKey: MemoScoreKey;
  weightKey: keyof ScoringWeights;
  evaluationNote: string;
}> = [
  {
    key: "team",
    title: "Team",
    icon: Users,
    scoreKey: "teamScore",
    weightKey: "team",
    evaluationNote:
      "Synthesized memo section validated against Team agent findings, risks, and data gaps.",
  },
  {
    key: "market",
    title: "Market Opportunity",
    icon: Target,
    scoreKey: "marketScore",
    weightKey: "market",
    evaluationNote:
      "Synthesized memo section validated against Market agent findings, risks, and data gaps.",
  },
  {
    key: "product",
    title: "Product and Technology",
    icon: Cpu,
    scoreKey: "productScore",
    weightKey: "product",
    evaluationNote:
      "Synthesized memo section validated against Product agent findings, risks, and data gaps.",
  },
  {
    key: "businessModel",
    title: "Business Model",
    icon: Building2,
    scoreKey: "businessModelScore",
    weightKey: "businessModel",
    evaluationNote:
      "Synthesized memo section validated against Business Model agent findings, risks, and data gaps.",
  },
  {
    key: "traction",
    title: "Traction and Metrics",
    icon: TrendingUp,
    scoreKey: "tractionScore",
    weightKey: "traction",
    evaluationNote:
      "Synthesized memo section validated against Traction agent findings, risks, and data gaps.",
  },
  {
    key: "gtm",
    title: "Go-to-Market Strategy",
    icon: Megaphone,
    scoreKey: "gtmScore",
    weightKey: "gtm",
    evaluationNote:
      "Synthesized memo section validated against GTM agent findings, risks, and data gaps.",
  },
  {
    key: "competitiveAdvantage",
    title: "Competitive Advantage",
    icon: Swords,
    scoreKey: "competitiveAdvantageScore",
    weightKey: "competitiveAdvantage",
    evaluationNote:
      "Synthesized memo section validated against Competitive agent findings, risks, and data gaps.",
  },
  {
    key: "financials",
    title: "Financials",
    icon: PiggyBank,
    scoreKey: "financialsScore",
    weightKey: "financials",
    evaluationNote:
      "Synthesized memo section validated against Financials agent findings, risks, and data gaps.",
  },
  {
    key: "legal",
    title: "Legal and Regulatory",
    icon: Scale,
    scoreKey: "legalScore",
    weightKey: "legal",
    evaluationNote:
      "Synthesized memo section validated against Legal agent findings, risks, and data gaps.",
  },
  {
    key: "dealTerms",
    title: "Deal Terms",
    icon: Handshake,
    scoreKey: "dealTermsScore",
    weightKey: "dealTerms",
    evaluationNote:
      "Synthesized memo section validated against Deal Terms agent findings, risks, and data gaps.",
  },
  {
    key: "exitPotential",
    title: "Exit Potential",
    icon: LogOut,
    scoreKey: "exitPotentialScore",
    weightKey: "exitPotential",
    evaluationNote:
      "Synthesized memo section validated against Exit Potential agent findings, risks, and data gaps.",
  },
];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getMemoSectionKey(title: string):
  | "team"
  | "market"
  | "product"
  | "businessModel"
  | "traction"
  | "gtm"
  | "competitiveAdvantage"
  | "financials"
  | "legal"
  | "dealTerms"
  | "exitPotential"
  | null {
  const normalized = normalizeTitle(title);
  const map: Record<string, typeof SECTION_CONFIG[number]["key"]> = {
    team: "team",
    market: "market",
    marketopportunity: "market",
    product: "product",
    producttechnology: "product",
    productandtechnology: "product",
    businessmodel: "businessModel",
    traction: "traction",
    tractionmetrics: "traction",
    tractionandmetrics: "traction",
    gotomarket: "gtm",
    gotomarketstrategy: "gtm",
    gtm: "gtm",
    competitiveadvantage: "competitiveAdvantage",
    financials: "financials",
    legal: "legal",
    legalregulatory: "legal",
    legalandregulatory: "legal",
    dealterms: "dealTerms",
    exitpotential: "exitPotential",
  };
  return map[normalized] ?? null;
}

function toSourceArray(value: unknown): MemoSectionSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { label: string; url: string } =>
      item != null &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).url === "string" &&
      ((item as Record<string, unknown>).url as string).length > 0,
    )
    .map((item) => ({
      label: typeof item.label === "string" && item.label.trim().length > 0 ? item.label.trim() : item.url,
      url: item.url,
    }));
}

function toMemoSections(value: unknown): InvestorMemoSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): InvestorMemoSection | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const content = typeof record.content === "string" ? record.content.trim() : "";
      if (!title || !content) return null;
      return {
        title,
        content,
        highlights: toStringArray(record.highlights),
        concerns: toStringArray(record.concerns),
        sources: toSourceArray(record.sources),
      };
    })
    .filter((item): item is InvestorMemoSection => item !== null);
}

function getScore(evaluation: Evaluation, scoreKey: MemoScoreKey): number | undefined {
  const value = evaluation[scoreKey];
  return typeof value === "number" ? value : undefined;
}

export function MemoTabContent({
  startup,
  evaluation,
  investorMemo,
  adminFeedback,
  showScores = true,
  weights,
  animateOnMount = false,
}: MemoTabContentProps) {
  const memo = (investorMemo ?? (evaluation.investorMemo as InvestorMemo | null | undefined)) ?? null;
  const memoSections = toMemoSections(memo?.sections);
  const sectionByKey = new Map<string, InvestorMemoSection>();

  for (const section of memoSections) {
    const key = getMemoSectionKey(section.title);
    if (key && !sectionByKey.has(key)) {
      sectionByKey.set(key, section);
    }
  }

  const dueDiligenceAreas = toStringArray(memo?.keyDueDiligenceAreas);
  const synthesisConfidence = (evaluation as unknown as Record<string, unknown>).confidenceScore as string | undefined ?? "unknown";

  const getAdminFeedbackProps = (sectionKey: string) => {
    if (!adminFeedback) return undefined;
    const evalAny = evaluation as unknown as Record<string, unknown>;
    const feedbackData = evalAny.adminFeedback as Record<string, { comment?: string }> | undefined;
    return {
      sectionKey,
      evaluationId: evaluation.id,
      existingComment: feedbackData?.[sectionKey]?.comment,
      onReanalyze: adminFeedback.onReanalyze,
      isReanalyzing: adminFeedback.reanalyzingSection === sectionKey,
    };
  };

  const executiveSummaryText =
    memo?.executiveSummary ||
    evaluation.executiveSummary ||
    `Synthesis executive summary for ${startup.name} is not available yet.`;

  return (
    <Card data-testid="card-investment-memo">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg" data-testid="text-memo-title">
              Investment Memo
            </CardTitle>
            <CardDescription data-testid="text-memo-description">
              Synthesis-generated memo across all evaluation dimensions
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/startups/${evaluation.startupId}/memo.pdf`, "_blank")}
            >
              <Download className="w-4 h-4 mr-1" />
              Memo PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/api/startups/${evaluation.startupId}/report.pdf`, "_blank")}
            >
              <Download className="w-4 h-4 mr-1" />
              Report PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6" data-testid="container-memo-sections">
        <Card
          className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background"
          data-testid="card-synthesis-verdict"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Synthesis Quality</CardTitle>
            <CardDescription>
              Confidence level and data-quality notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge
                confidence={synthesisConfidence}
                dataTestId="badge-synthesis-confidence"
              />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-synthesis-confidence-notes">
              {evaluation.dataConfidenceNotes || "No data confidence notes were provided by synthesis."}
            </p>
          </CardContent>
        </Card>

        <MemoSection
          title="Executive Summary"
          icon={FileText}
          animateOnMount={animateOnMount}
          summary={executiveSummaryText}
          defaultExpanded={true}
        />

        {SECTION_CONFIG.map((config) => {
          const section = sectionByKey.get(config.key);
          const sectionHighlights = toStringArray(section?.highlights);
          const sectionConcerns = toStringArray(section?.concerns);
          const sectionSources = section?.sources ?? [];
          const sectionDetails =
            sectionHighlights.length > 0 || sectionConcerns.length > 0 || sectionSources.length > 0 ? (
              <div className="space-y-3">
                {sectionHighlights.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium">Highlights</h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {sectionHighlights.slice(0, 4).map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sectionConcerns.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium">Concerns</h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {sectionConcerns.slice(0, 4).map((item, index) => (
                        <li key={`${item}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {sectionSources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t">
                    {sectionSources.map((source, index) => {
                      const isExternalLink = source.url.startsWith("http");
                      const pillClass =
                        "inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors";
                      return isExternalLink ? (
                        <a
                          key={`${source.url}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${pillClass} hover:bg-muted hover:text-foreground`}
                        >
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          {source.label}
                        </a>
                      ) : (
                        <span
                          key={`${source.url}-${index}`}
                          className={`${pillClass} cursor-default`}
                        >
                          <FileText className="h-2.5 w-2.5 shrink-0" />
                          {source.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : undefined;

          return (
            <MemoSection
              key={config.key}
              title={config.title}
              icon={config.icon}
              animateOnMount={animateOnMount}
              score={showScores ? getScore(evaluation, config.scoreKey) : undefined}
              weight={`${weights?.[config.weightKey] ?? 0}%`}
              summary={section?.content || "Synthesis section is not available yet for this dimension."}
              sources={sectionSources}
              details={sectionDetails}
              evaluationNote={config.evaluationNote}
              adminFeedback={getAdminFeedbackProps(config.key)}
            />
          );
        })}

        <div className="mt-6 pt-6 border-t" data-testid="section-due-diligence">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-base">Key Due Diligence Areas</h3>
          </div>
          {dueDiligenceAreas.length > 0 ? (
            <ul className="space-y-2">
              {dueDiligenceAreas.map((area, i) => (
                <li key={`${area}-${i}`} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0 mt-2" />
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Synthesis due-diligence areas are not available yet.
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
