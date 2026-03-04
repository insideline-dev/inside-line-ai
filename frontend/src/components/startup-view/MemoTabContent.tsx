import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface InvestorMemoSection {
  title: string;
  content: string;
  highlights?: string[];
  concerns?: string[];
}

interface InvestorMemo {
  executiveSummary?: string;
  summary?: string;
  sections?: InvestorMemoSection[];
  recommendation?: string;
  riskLevel?: string;
  dealHighlights?: string[];
  keyDueDiligenceAreas?: string[];
}

interface FounderReport {
  summary?: string;
  sections?: InvestorMemoSection[];
  actionItems?: string[];
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
  founderReport?: FounderReport | null;
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
  founderReport,
  adminFeedback,
  showScores = true,
  weights,
  animateOnMount = false,
}: MemoTabContentProps) {
  const memo = (investorMemo ?? (evaluation.investorMemo as InvestorMemo | null | undefined)) ?? null;
  const founderReportData =
    (founderReport ?? (evaluation.founderReport as FounderReport | null | undefined)) ?? null;
  const memoSections = toMemoSections(memo?.sections);
  const sectionByKey = new Map<string, InvestorMemoSection>();

  for (const section of memoSections) {
    const key = getMemoSectionKey(section.title);
    if (key && !sectionByKey.has(key)) {
      sectionByKey.set(key, section);
    }
  }

  const dueDiligenceAreas = toStringArray(memo?.keyDueDiligenceAreas);
  const founderActionItems = toStringArray(founderReportData?.actionItems);
  const founderSections = toMemoSections(founderReportData?.sections);
  const evaluationRecord = evaluation as unknown as Record<string, unknown>;
  const synthesisConfidence =
    (typeof evaluationRecord.confidenceLevel === "string" &&
      evaluationRecord.confidenceLevel) ||
    (typeof evaluationRecord.confidence === "string" && evaluationRecord.confidence) ||
    "unknown";

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
    evaluation.executiveSummary ||
    memo?.executiveSummary ||
    memo?.summary ||
    founderReport?.summary ||
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
            <CardTitle className="text-base">Synthesis Verdict</CardTitle>
            <CardDescription>
              Final synthesis recommendation, confidence, and data-quality notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" data-testid="badge-synthesis-recommendation">
                Recommendation: {memo?.recommendation || "Not provided"}
              </Badge>
              <Badge variant="secondary" className="capitalize" data-testid="badge-synthesis-risk-level">
                Risk: {memo?.riskLevel || "Not provided"}
              </Badge>
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
          details={
            memo?.dealHighlights && memo.dealHighlights.length > 0 ? (
              <div>
                <h4 className="font-medium mb-2">Deal Highlights</h4>
                <ul className="space-y-2">
                  {memo.dealHighlights.slice(0, 6).map((highlight, i) => (
                    <li key={`${highlight}-${i}`} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : undefined
          }
        />

        {SECTION_CONFIG.map((config) => {
          const section = sectionByKey.get(config.key);
          const sectionHighlights = toStringArray(section?.highlights);
          const sectionConcerns = toStringArray(section?.concerns);
          const sectionDetails =
            sectionHighlights.length > 0 || sectionConcerns.length > 0 ? (
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

        <div className="rounded-lg border bg-muted/20 p-4 space-y-3" data-testid="section-founder-report">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-base">Founder Report Action Plan</h3>
            <Badge variant="outline" data-testid="badge-founder-actions-count">
              {founderActionItems.length} action{founderActionItems.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {founderReportData?.summary || "Founder report summary is not available yet."}
          </p>
          {founderActionItems.length > 0 ? (
            <ul className="space-y-2">
              {founderActionItems.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No founder action items were generated by synthesis.
            </p>
          )}
          {founderSections.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              {founderSections.slice(0, 2).map((section, index) => (
                <div key={`${section.title}-${index}`} className="rounded-md border bg-background p-3">
                  <p className="text-sm font-medium">{section.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{section.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
