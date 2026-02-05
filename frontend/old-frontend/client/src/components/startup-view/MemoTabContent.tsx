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
  ThumbsUp,
  ThumbsDown,
  Search
} from "lucide-react";
import type { Startup, StartupEvaluation } from "@shared/schema";

interface InvestorMemo {
  dealHighlights?: string[];
  summary?: string;
  keyDueDiligenceAreas?: string[];
}

interface FounderReport {
  summary?: string;
}

interface AdminFeedbackHandler {
  onReanalyze: (sectionKey: string, comment: string) => Promise<void>;
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
  evaluation: StartupEvaluation;
  investorMemo?: InvestorMemo | null;
  founderReport?: FounderReport | null;
  adminFeedback?: AdminFeedbackHandler;
  showScores?: boolean;
  weights?: ScoringWeights | null;
  animateOnMount?: boolean;
}

function getSummaryFromData(data: any): string | null {
  if (!data) return null;
  
  if (typeof data.narrativeSummary === 'string' && data.narrativeSummary.length > 50) {
    return data.narrativeSummary;
  }
  
  if (typeof data.memoNarrative === 'string' && data.memoNarrative.length > 50) {
    return data.memoNarrative;
  }
  
  if (typeof data.summary === 'string' && data.summary.length > 50) {
    return data.summary;
  }
  
  if (typeof data.assessment === 'string' && data.assessment.length > 50) {
    return data.assessment;
  }
  
  return null;
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
  const getAdminFeedbackProps = (sectionKey: string) => {
    if (!adminFeedback) return undefined;
    return {
      sectionKey,
      evaluationId: evaluation.id,
      existingComment: (evaluation.adminFeedback as any)?.[sectionKey]?.comment,
      onReanalyze: adminFeedback.onReanalyze,
      isReanalyzing: adminFeedback.reanalyzingSection === sectionKey,
    };
  };

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
          summary={(evaluation as any)?.executiveSummary || investorMemo?.summary || founderReport?.summary || "This startup is currently under evaluation."}
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
          summary={(evaluation.teamData as any)?.memoNarrative || getSummaryFromData(evaluation.teamData)}
          evaluationNote="Evaluates founding team backgrounds, relevant experience, founder-market fit, and execution capability."
          adminFeedback={getAdminFeedbackProps("team")}
        />

        <MemoSection
          title="Market Opportunity"
          icon={Target}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.marketScore : undefined}
          weight={`${weights?.market ?? 0}%`}
          summary={getSummaryFromData(evaluation.marketData)}
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
          summary={getSummaryFromData(evaluation.productData)}
          evaluationNote="Assesses product differentiation, technology readiness, scalability, and defensive moat."
          adminFeedback={getAdminFeedbackProps("product")}
        />

        <MemoSection
          title="Business Model"
          icon={Building2}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.businessModelScore : undefined}
          weight={`${weights?.businessModel ?? 0}%`}
          summary={getSummaryFromData(evaluation.businessModelData)}
          evaluationNote="Evaluates unit economics, revenue model sustainability, pricing strategy."
          adminFeedback={getAdminFeedbackProps("businessModel")}
        />

        <MemoSection
          title="Traction & Metrics"
          icon={TrendingUp}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.tractionScore : undefined}
          weight={`${weights?.traction ?? 0}%`}
          summary={getSummaryFromData(evaluation.tractionData)}
          evaluationNote="Reviews revenue stage, growth signals, customer acquisition metrics."
          adminFeedback={getAdminFeedbackProps("traction")}
        />

        <MemoSection
          title="Go-to-Market Strategy"
          icon={Megaphone}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.gtmScore : undefined}
          weight={`${weights?.gtm ?? 0}%`}
          summary={getSummaryFromData(evaluation.gtmData)}
          evaluationNote="Analyzes sales motion, distribution channels, customer acquisition strategy."
          adminFeedback={getAdminFeedbackProps("gtm")}
        />

        <MemoSection
          title="Competitive Advantage"
          icon={Swords}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.competitiveAdvantageScore : undefined}
          weight={`${weights?.competitiveAdvantage ?? 0}%`}
          summary={getSummaryFromData(evaluation.competitiveAdvantageData)}
          evaluationNote="Analyzes competitive landscape, moat durability, barriers to entry, and network effects."
          adminFeedback={getAdminFeedbackProps("competitiveAdvantage")}
        />

        <MemoSection
          title="Financials"
          icon={PiggyBank}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.financialsScore : undefined}
          weight={`${weights?.financials ?? 0}%`}
          summary={getSummaryFromData(evaluation.financialsData)}
          evaluationNote="Reviews capital efficiency, burn rate, runway."
          adminFeedback={getAdminFeedbackProps("financials")}
        />

        <MemoSection
          title="Funding History"
          icon={Wallet}
          animateOnMount={animateOnMount}
          summary="Previous fundraising rounds and cap table structure."
          details={
            <div className="space-y-4">
              <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Funding history data coming soon.</p>
              </div>
              {(startup.roundSize || startup.valuation) && (
                <FundingRoundCard
                  round={formatStage(startup.stage) || "Current Round"}
                  amount={formatCurrency(startup.roundSize)}
                  valuation={formatCurrency(startup.valuation)}
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
          summary={getSummaryFromData(evaluation.dealTermsData)}
          evaluationNote="Analyzes valuation, deal structure, investor protections."
          adminFeedback={getAdminFeedbackProps("dealTerms")}
        />

        <MemoSection
          title="Legal & Regulatory"
          icon={Scale}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.legalScore : undefined}
          weight={`${weights?.legal ?? 0}%`}
          summary={getSummaryFromData(evaluation.legalData)}
          evaluationNote="Assesses IP position, regulatory compliance, legal risks."
          adminFeedback={getAdminFeedbackProps("legal")}
        />

        <MemoSection
          title="Exit Potential"
          icon={LogOut}
          animateOnMount={animateOnMount}
          score={showScores ? evaluation.exitPotentialScore : undefined}
          weight={`${weights?.exitPotential ?? 0}%`}
          summary={getSummaryFromData(evaluation.exitPotentialData)}
          evaluationNote="Evaluates M&A activity, IPO feasibility, strategic acquirers."
          adminFeedback={getAdminFeedbackProps("exitPotential")}
        />

        {/* Key Due Diligence Areas */}
        {investorMemo?.keyDueDiligenceAreas && investorMemo.keyDueDiligenceAreas.length > 0 && (
          <div className="mt-6 pt-6 border-t" data-testid="section-due-diligence">
            <div className="flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold text-base">Key Due Diligence Areas</h3>
            </div>
            <ul className="space-y-2">
              {investorMemo.keyDueDiligenceAreas.map((area, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0 mt-2" />
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
