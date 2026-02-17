import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MemoSection, FundingRoundCard } from "@/components/MemoSection";
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
  Wallet,
  Search
} from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface InvestorMemo {
  dealHighlights?: string[];
  summary?: string;
  keyDueDiligenceAreas?: string[];
}

interface FounderReport {
  summary?: string;
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function getSummaryFromData(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === "string") {
    const text = data.trim();
    return text.length > 0 ? text : null;
  }
  if (typeof data !== "object") return null;

  const record = data as Record<string, unknown>;

  const summaryFields = [
    "narrativeSummary",
    "memoNarrative",
    "summary",
    "assessment",
    "feedback",
    "overview",
    "analysis",
    "description",
    "detailedAnalysis",
    "investmentThesis",
    "financialHealth",
    "competitivePosition",
    "termsQuality",
    "legalStructure",
  ] as const;

  for (const field of summaryFields) {
    const value = record[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const findings = toStringArray(record.keyFindings);
  const risks = toStringArray(record.risks);
  if (findings.length > 0 || risks.length > 0) {
    const findingsText = findings.length > 0 ? `Key findings: ${findings.slice(0, 3).join("; ")}` : "";
    const risksText = risks.length > 0 ? `Risks: ${risks.slice(0, 2).join("; ")}` : "";
    return [findingsText, risksText].filter(Boolean).join("\n\n") || null;
  }

  const nestedSummaries = Object.values(record)
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    .flatMap((value) =>
      ["summary", "assessment", "feedback"]
        .map((field) => value[field])
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim()),
    );

  return nestedSummaries[0] ?? null;
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "N/A";
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function formatStage(stage: string | null | undefined): string {
  if (!stage) return "N/A";
  const stageMap: Record<string, string> = {
    "pre_seed": "Pre-Seed",
    "seed": "Seed",
    "series_a": "Series A",
    "series_b": "Series B",
    "series_c": "Series C",
    "series_d": "Series D",
    "series_e": "Series E",
    "series_f_plus": "Series F+",
  };
  return stageMap[stage] || stage.replace("_", " ");
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
  const dueDiligenceAreas = (() => {
    const fromInvestorMemo = toStringArray(investorMemo?.keyDueDiligenceAreas);
    if (fromInvestorMemo.length > 0) {
      return fromInvestorMemo;
    }

    const evalAny = evaluation as unknown as Record<string, unknown>;
    const fromRecommendations = toStringArray(evalAny.recommendations);
    if (fromRecommendations.length > 0) {
      return fromRecommendations;
    }

    const fromNextSteps = toStringArray(evalAny.nextSteps);
    if (fromNextSteps.length > 0) {
      return fromNextSteps;
    }

    return [];
  })();

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
    (evaluation as any)?.executiveSummary ||
    investorMemo?.summary ||
    founderReport?.summary ||
    "This startup is currently under evaluation.";

  return (
    <Card data-testid="card-investment-memo">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg" data-testid="text-memo-title">Investment Memo</CardTitle>
        <CardDescription data-testid="text-memo-description">
          Comprehensive analysis across 11 evaluation dimensions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6" data-testid="container-memo-sections">
        <MemoSection
          title="Executive Summary"
          icon={FileText}
          animateOnMount={animateOnMount}
          summary={executiveSummaryText}
          defaultExpanded={true}
          details={
            <div className="space-y-4">
              {startup.description && (
                <div>
                  <h4 className="font-medium mb-2">Company Overview</h4>
                  <p>{startup.description}</p>
                </div>
              )}
              {investorMemo?.dealHighlights && investorMemo.dealHighlights.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Deal Highlights</h4>
                  <ul className="space-y-2">
                    {investorMemo.dealHighlights.slice(0, 5).map((highlight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          }
        />

        <MemoSection
          title="Team"
          icon={Users}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.teamScore : undefined}
          weight={`${weights?.team ?? 0}%`}
          summary={
            (evaluation.teamData as any)?.memoNarrative ||
            getSummaryFromData(evaluation.teamData) ||
            "Team analysis is being compiled."
          }
          evaluationNote="Evaluates founding team backgrounds, relevant experience, founder-market fit, and execution capability."
          adminFeedback={getAdminFeedbackProps("team")}
        />

        <MemoSection
          title="Market Opportunity"
          icon={Target}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.marketScore : undefined}
          weight={`${weights?.market ?? 0}%`}
          summary={getSummaryFromData(evaluation.marketData) || "Market opportunity analysis is being compiled."}
          evaluationNote="Analyzes TAM/SAM/SOM, market timing, growth dynamics, and competitive landscape."
          adminFeedback={getAdminFeedbackProps("market")}
          details={
            <div className="space-y-4">
              {(evaluation.marketData as any)?.marketDynamics && (
                <div>
                  <h4 className="font-medium mb-2">Market Dynamics</h4>
                  <p>{(evaluation.marketData as any).marketDynamics}</p>
                </div>
              )}
              {(evaluation.marketData as any)?.whyNow && (
                <div>
                  <h4 className="font-medium mb-2">Why Now</h4>
                  <p>{(evaluation.marketData as any).whyNow}</p>
                </div>
              )}
            </div>
          }
        />

        <MemoSection
          title="Product & Technology"
          icon={Cpu}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.productScore : undefined}
          weight={`${weights?.product ?? 0}%`}
          summary={getSummaryFromData(evaluation.productData) || "Product and technology analysis is being compiled."}
          evaluationNote="Assesses product differentiation, technology readiness, scalability, and defensive moat."
          adminFeedback={getAdminFeedbackProps("product")}
        />

        <MemoSection
          title="Business Model"
          icon={Building2}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.businessModelScore : undefined}
          weight={`${weights?.businessModel ?? 0}%`}
          summary={getSummaryFromData(evaluation.businessModelData) || "Business model analysis is being compiled."}
          evaluationNote="Evaluates unit economics, revenue model sustainability, pricing strategy."
          adminFeedback={getAdminFeedbackProps("businessModel")}
        />

        <MemoSection
          title="Traction & Metrics"
          icon={TrendingUp}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.tractionScore : undefined}
          weight={`${weights?.traction ?? 0}%`}
          summary={getSummaryFromData(evaluation.tractionData) || "Traction and metrics analysis is being compiled."}
          evaluationNote="Reviews revenue stage, growth signals, customer acquisition metrics."
          adminFeedback={getAdminFeedbackProps("traction")}
        />

        <MemoSection
          title="Go-to-Market Strategy"
          icon={Megaphone}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.gtmScore : undefined}
          weight={`${weights?.gtm ?? 0}%`}
          summary={getSummaryFromData(evaluation.gtmData) || "Go-to-market analysis is being compiled."}
          evaluationNote="Analyzes sales motion, distribution channels, customer acquisition strategy."
          adminFeedback={getAdminFeedbackProps("gtm")}
        />

        <MemoSection
          title="Competitive Advantage"
          icon={Swords}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.competitiveAdvantageScore : undefined}
          weight={`${weights?.competitiveAdvantage ?? 0}%`}
          summary={getSummaryFromData(evaluation.competitiveAdvantageData) || "Competitive advantage analysis is being compiled."}
          evaluationNote="Analyzes competitive landscape, moat durability, barriers to entry, and network effects."
          adminFeedback={getAdminFeedbackProps("competitiveAdvantage")}
        />

        <MemoSection
          title="Financials"
          icon={PiggyBank}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.financialsScore : undefined}
          weight={`${weights?.financials ?? 0}%`}
          summary={getSummaryFromData(evaluation.financialsData) || "Financial analysis is being compiled."}
          evaluationNote="Reviews capital efficiency, burn rate, runway."
          adminFeedback={getAdminFeedbackProps("financials")}
        />

        <MemoSection
          title="Funding History"
          icon={Wallet}
          animateOnMount={animateOnMount}
          summary={
            startup.hasPreviousFunding
              ? "Historical fundraising rounds and prior investor participation."
              : "No prior funding rounds reported; current round details are shown below."
          }
          details={
            <div className="space-y-4">
              <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {startup.hasPreviousFunding
                    ? "Prior funding details are partially available."
                    : "No previous funding rounds disclosed."}
                </p>
              </div>
              {(startup.fundingTarget || startup.valuation) && (
                <FundingRoundCard
                  round={formatStage(startup.stage) || "Current Round"}
                  amount={formatCurrency(startup.fundingTarget)}
                  valuation={formatCurrency(startup.valuation)}
                  leadInvestor={startup.leadInvestorName || undefined}
                />
              )}
              {startup.hasPreviousFunding && (
                <FundingRoundCard
                  round={startup.previousRoundType || "Previous Round"}
                  amount={formatCurrency(startup.previousFundingAmount)}
                  valuation={undefined}
                  investors={
                    startup.previousInvestors
                      ? startup.previousInvestors
                          .split(",")
                          .map((name) => name.trim())
                          .filter((name) => name.length > 0)
                      : undefined
                  }
                />
              )}
            </div>
          }
        />

        <MemoSection
          title="Deal Terms"
          icon={Handshake}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.dealTermsScore : undefined}
          weight={`${weights?.dealTerms ?? 0}%`}
          summary={getSummaryFromData(evaluation.dealTermsData) || "Deal terms analysis is being compiled."}
          evaluationNote="Analyzes valuation, deal structure, investor protections."
          adminFeedback={getAdminFeedbackProps("dealTerms")}
        />

        <MemoSection
          title="Legal & Regulatory"
          icon={Scale}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.legalScore : undefined}
          weight={`${weights?.legal ?? 0}%`}
          summary={getSummaryFromData(evaluation.legalData) || "Legal and regulatory analysis is being compiled."}
          evaluationNote="Assesses IP position, regulatory compliance, legal risks."
          adminFeedback={getAdminFeedbackProps("legal")}
        />

        <MemoSection
          title="Exit Potential"
          icon={LogOut}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.exitPotentialScore : undefined}
          weight={`${weights?.exitPotential ?? 0}%`}
          summary={getSummaryFromData(evaluation.exitPotentialData) || "Exit potential analysis is being compiled."}
          evaluationNote="Evaluates M&A activity, IPO feasibility, strategic acquirers."
          adminFeedback={getAdminFeedbackProps("exitPotential")}
        />

        {/* Key Due Diligence Areas */}
        <div className="mt-6 pt-6 border-t" data-testid="section-due-diligence">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-base">Key Due Diligence Areas</h3>
          </div>
          {dueDiligenceAreas.length > 0 ? (
            <ul className="space-y-2">
              {dueDiligenceAreas.map((area, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0 mt-2" />
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Due diligence areas were not generated for this run.
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
}
