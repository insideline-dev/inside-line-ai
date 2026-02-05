import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { 
  Users, 
  Target, 
  Cpu, 
  TrendingUp, 
  DollarSign, 
  Megaphone, 
  PiggyBank, 
  Shield, 
  Scale, 
  Handshake, 
  LogOut,
  ChevronDown,
  CheckCircle,
  AlertTriangle 
} from "lucide-react";

interface SectionSummary {
  keyStrengths?: string[];
  keyRisks?: string[];
  summary?: string;
}

interface ScoreItem {
  id: string;
  label: string;
  shortLabel: string;
  score: number;
  icon: typeof Users;
  weight: string;
  summary?: SectionSummary;
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

interface ScoreBreakdownProps {
  teamScore?: number;
  marketScore?: number;
  productScore?: number;
  tractionScore?: number;
  businessModelScore?: number;
  gtmScore?: number;
  financialsScore?: number;
  competitiveAdvantageScore?: number;
  legalScore?: number;
  dealTermsScore?: number;
  exitPotentialScore?: number;
  teamSummary?: SectionSummary;
  marketSummary?: SectionSummary;
  productSummary?: SectionSummary;
  tractionSummary?: SectionSummary;
  businessModelSummary?: SectionSummary;
  gtmSummary?: SectionSummary;
  financialsSummary?: SectionSummary;
  competitiveAdvantageSummary?: SectionSummary;
  legalSummary?: SectionSummary;
  dealTermsSummary?: SectionSummary;
  exitPotentialSummary?: SectionSummary;
  weights: ScoringWeights; // Required - must be fetched from database
  className?: string;
  compact?: boolean;
  expandable?: boolean;
}

export function ScoreBreakdown({
  teamScore = 0,
  marketScore = 0,
  productScore = 0,
  tractionScore = 0,
  businessModelScore = 0,
  gtmScore = 0,
  financialsScore = 0,
  competitiveAdvantageScore = 0,
  legalScore = 0,
  dealTermsScore = 0,
  exitPotentialScore = 0,
  teamSummary,
  marketSummary,
  productSummary,
  tractionSummary,
  businessModelSummary,
  gtmSummary,
  financialsSummary,
  competitiveAdvantageSummary,
  legalSummary,
  dealTermsSummary,
  exitPotentialSummary,
  weights, // Required - must be fetched from database
  className,
  compact = false,
  expandable = false,
}: ScoreBreakdownProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const scores: ScoreItem[] = [
    { id: "team", label: "Team", shortLabel: "Team", score: teamScore, icon: Users, weight: `${weights.team}%`, summary: teamSummary },
    { id: "market", label: "Market", shortLabel: "Market", score: marketScore, icon: Target, weight: `${weights.market}%`, summary: marketSummary },
    { id: "product", label: "Product & Technology", shortLabel: "Product", score: productScore, icon: Cpu, weight: `${weights.product}%`, summary: productSummary },
    { id: "traction", label: "Traction", shortLabel: "Traction", score: tractionScore, icon: TrendingUp, weight: `${weights.traction}%`, summary: tractionSummary },
    { id: "businessModel", label: "Business Model", shortLabel: "Biz Model", score: businessModelScore, icon: DollarSign, weight: `${weights.businessModel}%`, summary: businessModelSummary },
    { id: "gtm", label: "Go-To-Market", shortLabel: "GTM", score: gtmScore, icon: Megaphone, weight: `${weights.gtm}%`, summary: gtmSummary },
    { id: "financials", label: "Financials", shortLabel: "Financials", score: financialsScore, icon: PiggyBank, weight: `${weights.financials}%`, summary: financialsSummary },
    { id: "competitiveAdvantage", label: "Competitive Advantage", shortLabel: "Moat", score: competitiveAdvantageScore, icon: Shield, weight: `${weights.competitiveAdvantage}%`, summary: competitiveAdvantageSummary },
    { id: "legal", label: "Legal & Regulatory", shortLabel: "Legal", score: legalScore, icon: Scale, weight: `${weights.legal}%`, summary: legalSummary },
    { id: "dealTerms", label: "Deal Terms", shortLabel: "Terms", score: dealTermsScore, icon: Handshake, weight: `${weights.dealTerms}%`, summary: dealTermsSummary },
    { id: "exitPotential", label: "Exit Potential", shortLabel: "Exit", score: exitPotentialScore, icon: LogOut, weight: `${weights.exitPotential}%`, summary: exitPotentialSummary },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-chart-2";
    if (score >= 60) return "bg-chart-1";
    if (score >= 40) return "bg-chart-4";
    return "bg-destructive";
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 80) return "text-chart-2";
    if (score >= 60) return "text-chart-1";
    if (score >= 40) return "text-chart-4";
    return "text-destructive";
  };

  const hasSummary = (item: ScoreItem) => {
    return item.summary && (
      (item.summary.keyStrengths && item.summary.keyStrengths.length > 0) ||
      (item.summary.keyRisks && item.summary.keyRisks.length > 0) ||
      item.summary.summary
    );
  };

  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">11-Section Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {scores.map((item) => (
              <div 
                key={item.label} 
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                data-testid={`score-${item.shortLabel.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className={cn("w-4 h-4", getScoreTextColor(item.score))} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground truncate block">{item.shortLabel}</span>
                  <span className={cn("text-sm font-semibold", getScoreTextColor(item.score))}>
                    {Math.round(item.score)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">11-Section Framework Scores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {scores.map((item) => {
          const isExpanded = expandedItems.has(item.id);
          const canExpand = expandable && hasSummary(item);

          if (canExpand) {
            return (
              <Collapsible
                key={item.id}
                open={isExpanded}
                onOpenChange={() => toggleExpand(item.id)}
              >
                <CollapsibleTrigger 
                  className="w-full text-left"
                  data-testid={`score-expand-${item.id}`}
                >
                  <div className="space-y-1 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`score-row-${item.shortLabel.toLowerCase().replace(/\s+/g, "-")}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <item.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                        <span className="text-xs text-muted-foreground">({item.weight})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-semibold tabular-nums", getScoreTextColor(item.score))}>
                          {Math.round(item.score)}
                        </span>
                        <ChevronDown className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180"
                        )} />
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", getScoreColor(item.score))}
                        style={{ width: `${Math.max(item.score, 2)}%` }}
                      />
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-8 pr-2 pb-3 space-y-3">
                    {item.summary?.summary && (
                      <p className="text-sm text-muted-foreground">{item.summary.summary}</p>
                    )}
                    {item.summary?.keyStrengths && item.summary.keyStrengths.length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-chart-2 mb-1">Strengths</h5>
                        <ul className="space-y-1">
                          {item.summary.keyStrengths.slice(0, 2).map((s, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <CheckCircle className="w-3 h-3 text-chart-2 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {item.summary?.keyRisks && item.summary.keyRisks.length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-chart-4 mb-1">Risks</h5>
                        <ul className="space-y-1">
                          {item.summary.keyRisks.slice(0, 2).map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <AlertTriangle className="w-3 h-3 text-chart-4 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          }

          return (
            <div key={item.id} className="space-y-1 p-2" data-testid={`score-row-${item.shortLabel.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <item.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  <span className="text-xs text-muted-foreground">({item.weight})</span>
                </div>
                <span className={cn("text-sm font-semibold tabular-nums", getScoreTextColor(item.score))}>
                  {Math.round(item.score)}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", getScoreColor(item.score))}
                  style={{ width: `${Math.max(item.score, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
