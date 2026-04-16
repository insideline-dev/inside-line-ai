import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { MarkdownText } from "@/components/MarkdownText";
import {
  Building2,
  Globe,
  DollarSign,
  Users,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Calendar,
  MapPin,
  Briefcase,
  Zap,
  Shield,
  Link as LinkIcon,
  Cpu,
  Scale,
  XCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CompetitorFunding {
  totalRaised: string | null;
  lastRound: string | null;
  lastRoundDate: string | null;
  keyInvestors: string[];
  marketCap?: string | null;
  isPublic?: boolean;
}

interface CompetitorProduct {
  keyFeatures: string[];
  pricingTiers: string | null;
  targetSegment: string;
}

interface CompetitorMarketPosition {
  estimatedRevenue: string | null;
  customerBase: string | null;
  marketShare: string | null;
}

interface DirectCompetitor {
  name: string;
  website: string;
  description: string;
  foundingYear: number | null;
  headquarters: string | null;
  employeeCount: string | null;
  funding: CompetitorFunding;
  product: CompetitorProduct;
  marketPosition: CompetitorMarketPosition;
  recentActivity: string[];
  strengths: string[];
  weaknesses: string[];
  sources: string[];
}

interface IndirectCompetitor {
  name: string;
  website: string;
  description: string;
  threatLevel: "high" | "medium" | "low";
  whyIndirect: string;
  funding: string | null;
  strengths: string[];
  sources: string[];
}

interface ProductDefinition {
  coreOffering: string;
  keyFeatures: string[];
  targetCustomers: string;
  valueProposition: string;
  pricingModel: string;
  marketCategory: string;
}

interface MarketLandscape {
  totalMarketPlayers: string;
  marketConcentration: string;
  dominantPlayers: string[];
  marketTrends: string[];
  recentMnA: Array<{
    acquirer: string;
    target: string;
    date: string;
    value: string | null;
    source: string;
  }>;
  emergingThreats: string[];
  barrierAnalysis: string;
}

interface SourceSummary {
  primarySources: string[];
  dataFreshness: string;
  researchConfidence: "high" | "medium" | "low";
  dataGaps: string[];
}

interface BasicCompetitorLandscape {
  directCompetitors?: string[];
  indirectCompetitors?: string[];
  competitiveAdvantages?: string[];
  competitiveDisadvantages?: string[];
}

interface CompetitivePositioning {
  startupAdvantages?: string[];
  startupDisadvantages?: string[];
  differentiationStrength?: "strong" | "moderate" | "weak";
  currentGap?: string;
  vulnerabilities?: string[];
  defensibleAgainstFunded?: boolean | null;
  differentiationType?: string;
  differentiationDurability?: string;
  gapEvidence?: string;
  defensibilityRationale?: string;
  timeToReplicate?: string;
  differentiationSummary?: string;
  uniqueValueProposition?: string;
  moatStage?: string;
  moatEvidence?: string[];
  moatSelfReinforcing?: boolean | null;
}

interface BarrierBooleans {
  technical: boolean;
  capital: boolean;
  network: boolean;
  regulatory: boolean;
}

interface BarriersToEntry {
  technical?: string;
  regulatory?: string;
  capital?: string;
  network?: string;
}

interface Hyperscaler {
  name: string;
  strengths?: string[];
  weaknesses_vs_parasail?: string[];
  competitive_note?: string;
}

interface AlternativeDirectCompetitor {
  name: string;
  profile?: string;
  strengths?: string[];
  parasail_advantage?: string[];
  risk_to_parasail?: string;
}

interface AlternativeIndirectCompetitor {
  category?: string;
  examples?: string[];
  why_they_compete?: string;
  parasail_response?: string;
}

interface CompetitorAnalysisProps {
  productDefinition?: ProductDefinition | null;
  directCompetitors?: (DirectCompetitor | AlternativeDirectCompetitor)[];
  indirectCompetitors?: (IndirectCompetitor | AlternativeIndirectCompetitor)[];
  hyperscalers?: Hyperscaler[];
  marketLandscape?: MarketLandscape | null;
  sourceSummary?: SourceSummary | null;
  companyName: string;
  basicLandscape?: BasicCompetitorLandscape | null;
  positioning?: {
    strategy?: string;
    differentiation?: string;
    uniqueValueProp?: string;
  } | null;
  competitivePositioning?: CompetitivePositioning | null;
  barriersToEntry?: BarriersToEntry | null;
  barrierBooleans?: BarrierBooleans | null;
  keyStrengths?: string[];
  keyRisks?: string[];
  competitiveAdvantageScore?: number | null;
  competitiveAdvantageWeight?: number;
  competitiveAdvantageConfidence?: string;
  subScores?: Array<{ dimension: string; weight: number; score: number }>;
  scoringBasis?: string;
  forcePrint?: boolean;
}

function getThreatBadgeVariant(
  level: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "outline";
  }
}

function formatUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function ProductDefinitionCard({
  definition,
  companyName,
}: {
  definition: ProductDefinition;
  companyName: string;
}) {
  const keyFeatures = definition?.keyFeatures || [];

  return (
    <Card data-testid="card-product-definition">
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-lg text-balance"
          data-testid="text-product-definition-title"
        >
          <Target className="h-5 w-5 text-primary" />
          {companyName}&apos;s Product Definition
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Core Offering
          </p>
          <MarkdownText className="text-sm text-pretty [&>p]:mb-0" data-testid="text-core-offering">
            {definition?.coreOffering || "Not specified"}
          </MarkdownText>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Value Proposition
          </p>
          <MarkdownText className="text-sm text-pretty [&>p]:mb-0" data-testid="text-value-proposition">
            {definition?.valueProposition || "Not specified"}
          </MarkdownText>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Target Customers
            </p>
            <p className="text-sm text-pretty" data-testid="text-target-customers">
              {definition?.targetCustomers || "Not specified"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Market Category
            </p>
            <p className="text-sm text-pretty" data-testid="text-market-category">
              {definition?.marketCategory || "Not specified"}
            </p>
          </div>
        </div>

        {keyFeatures.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Key Features
            </p>
            <div
              className="flex flex-wrap gap-1.5"
              data-testid="list-key-features"
            >
              {keyFeatures.map((feature, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Pricing Model
          </p>
          <Badge variant="outline" data-testid="badge-pricing-model">
            {definition?.pricingModel || "Unknown"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function DirectCompetitorCard({
  competitor,
  index,
}: {
  competitor: DirectCompetitor;
  index: number;
}) {
  const funding = competitor?.funding || {};
  const product = competitor?.product || {};
  const strengths = competitor?.strengths || [];
  const weaknesses = competitor?.weaknesses || [];
  const recentActivity = competitor?.recentActivity || [];
  const sources = competitor?.sources || [];
  const productFeatures = product?.keyFeatures || [];
  const keyInvestors = funding?.keyInvestors || [];

  return (
    <Card
      data-testid={`card-competitor-direct-${index}`}
      className="overflow-hidden"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle
              className="text-lg flex items-center gap-2 text-balance"
              data-testid={`text-competitor-name-${index}`}
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                {competitor?.name || "Unknown Competitor"}
              </MarkdownText>
            </CardTitle>
            {competitor?.website && (
              <a
                href={
                  competitor.website.startsWith("http")
                    ? competitor.website
                    : `https://${competitor.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                data-testid={`link-competitor-website-${index}`}
              >
                <Globe className="h-3 w-3" />
                {formatUrl(competitor.website)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <Badge variant="destructive" className="text-xs">
            Direct
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MarkdownText
          className="text-sm text-muted-foreground text-pretty [&>p]:mb-0"
          data-testid={`text-competitor-description-${index}`}
        >
          {competitor?.description || "No description available"}
        </MarkdownText>

        <div className="grid grid-cols-3 gap-3 text-sm">
          {competitor?.foundingYear && (
            <div
              className="flex items-center gap-1.5"
              data-testid={`text-founded-year-${index}`}
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Founded {competitor.foundingYear}</span>
            </div>
          )}
          {competitor?.headquarters && (
            <div
              className="flex items-center gap-1.5"
              data-testid={`text-headquarters-${index}`}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{competitor.headquarters}</span>
            </div>
          )}
          {competitor?.employeeCount && (
            <div
              className="flex items-center gap-1.5"
              data-testid={`text-employee-count-${index}`}
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{competitor.employeeCount}</span>
            </div>
          )}
        </div>

        {funding.marketCap || funding.isPublic ? (
          <div
            className="p-3 bg-muted/50 rounded-lg"
            data-testid={`section-marketcap-${index}`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Market Cap</span>
              <Badge variant="outline" className="text-xs ml-auto">
                Public
              </Badge>
            </div>
            <div className="text-sm">
              <span className="font-medium">{funding.marketCap || "N/A"}</span>
            </div>
          </div>
        ) : (
          (funding.totalRaised || funding.lastRound) && (
            <div
              className="p-3 bg-muted/50 rounded-lg"
              data-testid={`section-funding-${index}`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Funding</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {funding.totalRaised && (
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    <MarkdownText inline className="inline font-medium [&>p]:inline [&>p]:mb-0">
                      {funding.totalRaised}
                    </MarkdownText>
                  </div>
                )}
                {funding.lastRound && (
                  <div>
                    <span className="text-muted-foreground">Last: </span>
                    <MarkdownText inline className="inline font-medium [&>p]:inline [&>p]:mb-0">
                      {funding.lastRound}
                    </MarkdownText>
                    {funding.lastRoundDate && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({funding.lastRoundDate})
                      </span>
                    )}
                  </div>
                )}
              </div>
              {keyInvestors.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground text-pretty">
                  Investors: <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">{keyInvestors.slice(0, 3).join(", ")}</MarkdownText>
                  {keyInvestors.length > 3 &&
                    ` +${keyInvestors.length - 3} more`}
                </div>
              )}
            </div>
          )
        )}

        {productFeatures.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Product</span>
            </div>
            <div
              className="flex flex-wrap gap-1 mb-2"
              data-testid={`list-product-features-${index}`}
            >
              {productFeatures.slice(0, 4).map((feature, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
            {product.targetSegment && (
              <p className="text-xs text-muted-foreground">
                Target: <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">{product.targetSegment}</MarkdownText>
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Strengths</span>
            </div>
            <ul
              className="text-xs space-y-1"
              data-testid={`list-strengths-${index}`}
            >
              {strengths.slice(0, 3).map((s, i) => (
                <li key={i} className="text-muted-foreground">
                  • <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{s}</MarkdownText>
                </li>
              ))}
              {strengths.length === 0 && (
                <li className="text-muted-foreground italic">
                  None identified
                </li>
              )}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Weaknesses</span>
            </div>
            <ul
              className="text-xs space-y-1"
              data-testid={`list-weaknesses-${index}`}
            >
              {weaknesses.slice(0, 3).map((w, i) => (
                <li key={i} className="text-muted-foreground">
                  • <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{w}</MarkdownText>
                </li>
              ))}
              {weaknesses.length === 0 && (
                <li className="text-muted-foreground italic">
                  None identified
                </li>
              )}
            </ul>
          </div>
        </div>

        {recentActivity.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Recent Activity</span>
            </div>
            <ul
              className="text-xs space-y-1"
              data-testid={`list-activity-${index}`}
            >
              {recentActivity.slice(0, 2).map((activity, i) => (
                <li key={i} className="text-muted-foreground">
                  • <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{activity}</MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {sources.length > 0 && (
          <div className="pt-2 border-t">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center gap-1 text-xs text-muted-foreground cursor-help"
                  data-testid={`text-sources-count-${index}`}
                >
                  <LinkIcon className="h-3 w-3" />
                  <span>
                    {sources.length} source
                    {sources.length > 1 ? "s" : ""}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                <div className="space-y-1">
                  {sources.slice(0, 5).map((source, i) => (
                    <p key={i} className="text-xs truncate text-pretty">
                      {source}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function IndirectCompetitorCard({
  competitor,
  index,
}: {
  competitor: IndirectCompetitor;
  index: number;
}) {
  const strengths = competitor?.strengths || [];
  const sources = competitor?.sources || [];

  return (
    <Card
      data-testid={`card-competitor-indirect-${index}`}
      className="overflow-hidden"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle
              className="text-base flex items-center gap-2 text-balance"
              data-testid={`text-indirect-competitor-name-${index}`}
            >
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                {competitor?.name || "Unknown Competitor"}
              </MarkdownText>
            </CardTitle>
            {competitor?.website && (
              <a
                href={
                  competitor.website.startsWith("http")
                    ? competitor.website
                    : `https://${competitor.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                data-testid={`link-indirect-competitor-website-${index}`}
              >
                <Globe className="h-3 w-3" />
                {formatUrl(competitor.website)}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={getThreatBadgeVariant(competitor?.threatLevel || "medium")}
              className="text-xs"
              data-testid={`badge-threat-level-${index}`}
            >
              {competitor?.threatLevel || "medium"} threat
            </Badge>
            <Badge variant="secondary" className="text-xs">
              Indirect
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MarkdownText
          className="text-sm text-muted-foreground text-pretty [&>p]:mb-0"
          data-testid={`text-indirect-description-${index}`}
        >
          {competitor?.description || "No description available"}
        </MarkdownText>

        <div className="rounded bg-muted/50 p-2 text-xs text-pretty">
          <span className="font-medium">Why indirect: </span>
          <MarkdownText inline className="inline text-muted-foreground [&>p]:inline [&>p]:mb-0">
            {competitor?.whyIndirect || "Not specified"}
          </MarkdownText>
        </div>

        {competitor?.funding && (
          <div className="flex items-center gap-1.5 text-sm">
            <DollarSign className="h-3.5 w-3.5 text-green-600" />
            <span>Funding: <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">{competitor.funding}</MarkdownText></span>
          </div>
        )}

        {strengths.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium">Key Strengths</span>
            </div>
            <ul
              className="text-xs space-y-0.5"
              data-testid={`list-indirect-strengths-${index}`}
            >
              {strengths.slice(0, 2).map((s, i) => (
                <li key={i} className="text-muted-foreground">
                  • <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{s}</MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {sources.length > 0 && (
          <div className="pt-2 border-t">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center gap-1 text-xs text-muted-foreground cursor-help"
                  data-testid={`text-indirect-sources-${index}`}
                >
                  <LinkIcon className="h-3 w-3" />
                  <span>
                    {sources.length} source
                    {sources.length > 1 ? "s" : ""}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                <div className="space-y-1">
                  {sources.slice(0, 5).map((source, i) => (
                    <p key={i} className="text-xs truncate text-pretty">
                      {source}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MarketLandscapeCard({
  landscape,
}: {
  landscape: MarketLandscape;
}) {
  const dominantPlayers = landscape?.dominantPlayers || [];
  const marketTrends = landscape?.marketTrends || [];
  const recentMnA = landscape?.recentMnA || [];
  const emergingThreats = landscape?.emergingThreats || [];

  return (
    <Card data-testid="card-market-landscape">
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-lg text-balance"
          data-testid="text-market-landscape-title"
        >
          <TrendingUp className="h-5 w-5 text-primary" />
          Market Landscape
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Market Players
            </p>
            <p className="text-sm text-pretty" data-testid="text-market-players">
              {landscape?.totalMarketPlayers || "Unknown"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Concentration
            </p>
            <Badge
              variant="outline"
              className="capitalize"
              data-testid="badge-concentration"
            >
              {landscape?.marketConcentration || "Unknown"}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Entry Barriers
            </p>
            <p className="text-xs text-muted-foreground text-pretty">
              {landscape?.barrierAnalysis
                ? `${landscape.barrierAnalysis.slice(0, 100)}...`
                : "Not analyzed"}
            </p>
          </div>
        </div>

        {dominantPlayers.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Market Leaders
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="list-market-leaders">
              {dominantPlayers.map((player, i) => (
                <Badge key={i} variant="secondary">
                  {player}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {marketTrends.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Key Trends
            </p>
            <ul className="text-sm space-y-1" data-testid="list-market-trends">
              {marketTrends.slice(0, 4).map((trend, i) => (
                <li key={i} className="flex items-start gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <MarkdownText className="inline text-muted-foreground text-pretty [&>p]:inline [&>p]:mb-0">
                    {trend}
                  </MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {recentMnA.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Recent M&A Activity
            </p>
            <div className="space-y-2" data-testid="list-mna-activity">
              {recentMnA.slice(0, 3).map((deal, i) => (
                <div key={i} className="p-2 bg-muted/50 rounded text-sm">
                  <span className="font-medium">{deal?.acquirer || "Unknown"}</span>
                  <span className="text-muted-foreground"> acquired </span>
                  <span className="font-medium">{deal?.target || "Unknown"}</span>
                  {deal?.value && (
                    <span className="text-green-600 ml-1">({deal.value})</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-2">
                    {deal?.date || ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {emergingThreats.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Emerging Threats
            </p>
            <ul className="text-sm space-y-1" data-testid="list-emerging-threats">
              {emergingThreats.slice(0, 3).map((threat, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <MarkdownText className="inline text-muted-foreground text-pretty [&>p]:inline [&>p]:mb-0">
                    {threat}
                  </MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SourcesCard({ sources }: { sources: SourceSummary }) {
  const primarySources = sources?.primarySources || [];
  const dataGaps = sources?.dataGaps || [];
  const confidence = sources?.researchConfidence || "medium";

  return (
    <Card data-testid="card-research-sources">
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-lg text-balance"
          data-testid="text-sources-title"
        >
          <LinkIcon className="h-5 w-5 text-primary" />
          Research Sources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Confidence
            </p>
            <Badge
              variant={
                confidence === "high"
                  ? "default"
                  : confidence === "medium"
                    ? "secondary"
                    : "outline"
              }
              className="capitalize"
              data-testid="badge-research-confidence"
            >
              {confidence}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">
              Data Freshness
            </p>
            <p className="text-sm text-pretty" data-testid="text-data-freshness">
              {sources?.dataFreshness || "Unknown"}
            </p>
          </div>
        </div>

        {primarySources.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Primary Sources
            </p>
            <ul className="text-sm space-y-1" data-testid="list-primary-sources">
              {primarySources.map((source, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Shield className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                  <MarkdownText className="inline text-muted-foreground text-pretty [&>p]:inline [&>p]:mb-0">
                    {source}
                  </MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dataGaps.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Data Gaps
            </p>
            <ul className="text-sm space-y-1" data-testid="list-data-gaps">
              {dataGaps.map((gap, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <MarkdownText className="inline text-muted-foreground text-pretty [&>p]:inline [&>p]:mb-0">
                    {gap}
                  </MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getCompetitorWebsite(name: string): string {
  const cleanName = name
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  return `https://${cleanName}.com`;
}

function getFundingBadgeColor(amount: string | null): string {
  if (!amount) return "bg-muted text-muted-foreground";
  const lower = amount.toLowerCase();
  if (lower.includes("b")) return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
  if (lower.includes("m")) {
    const num = parseFloat(lower.replace(/[^0-9.]/g, ""));
    if (num >= 100) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    if (num >= 10) return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400";
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }
  return "bg-muted text-muted-foreground";
}

function getThreatLevelColor(level: string): string {
  switch (level) {
    case "high":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "medium":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "low":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function CompactCompetitorCard({
  name,
  description,
  funding,
  website,
  index,
  whyIndirect,
  threatLevel,
}: {
  name: string;
  description: string;
  funding: string | null;
  website: string;
  index: number;
  whyIndirect?: string;
  threatLevel?: "high" | "medium" | "low";
}) {
  const href = website || getCompetitorWebsite(name);
  return (
    <div
      className="rounded-lg border bg-card p-3 space-y-2"
      data-testid={`compact-competitor-${index}`}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-semibold text-sm hover:underline"
      >
        <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
          {name}
        </MarkdownText>
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
      </a>
      {description && (
        <MarkdownText className="text-xs text-muted-foreground text-pretty [&>p]:mb-0" data-testid={`text-compact-competitor-description-${index}`}>
          {description}
        </MarkdownText>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {funding && (
          <Badge className={cn("text-xs", getFundingBadgeColor(funding))}>
            <DollarSign className="h-3 w-3 mr-0.5 shrink-0" />
            <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
              {funding}
            </MarkdownText>
          </Badge>
        )}
        {threatLevel && (
          <Badge className={cn("text-xs capitalize", getThreatLevelColor(threatLevel))}>
            {threatLevel} threat
          </Badge>
        )}
      </div>
      {whyIndirect && (
        <MarkdownText className="text-xs text-muted-foreground/80 text-pretty [&>p]:mb-0">
          {whyIndirect}
        </MarkdownText>
      )}
    </div>
  );
}

function BasicCompetitorLandscapeCard({
  landscape,
  competitivePositioning,
  barrierBooleans,
  directCompetitors = [],
  indirectCompetitors = [],
  keyStrengths = [],
  keyRisks = [],
  score,
  weight,
  confidence,
  subScores,
  scoringBasis,
}: {
  landscape: BasicCompetitorLandscape;
  competitivePositioning?: CompetitivePositioning | null;
  barrierBooleans?: BarrierBooleans | null;
  directCompetitors?: DirectCompetitor[];
  indirectCompetitors?: (IndirectCompetitor | AlternativeIndirectCompetitor)[];
  keyStrengths?: string[];
  keyRisks?: string[];
  score?: number | null;
  weight?: number;
  confidence?: string;
  subScores?: Array<{ dimension: string; weight: number; score: number }>;
  scoringBasis?: string;
}) {
  const directNames = landscape?.directCompetitors || [];
  const indirectNames = landscape?.indirectCompetitors || [];
  const advantages =
    competitivePositioning?.startupAdvantages ||
    landscape?.competitiveAdvantages ||
    [];
  const disadvantages =
    competitivePositioning?.startupDisadvantages ||
    landscape?.competitiveDisadvantages ||
    [];
  const vulnerabilities = competitivePositioning?.vulnerabilities || [];


  const getDifferentiationBorderColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case "technology": return "border-l-blue-500";
      case "network_effects": return "border-l-purple-500";
      case "data": return "border-l-cyan-500";
      case "brand": return "border-l-pink-500";
      case "cost": return "border-l-orange-500";
      case "regulatory": return "border-l-indigo-500";
      default: return "border-l-muted-foreground";
    }
  };

  const getDurabilityBorderColor = (durability?: string) => {
    switch (durability?.toLowerCase()) {
      case "strong": case "high": return "border-l-green-500";
      case "moderate": case "medium": return "border-l-amber-500";
      case "weak": case "low": return "border-l-red-500";
      default: return "border-l-muted-foreground";
    }
  };

  const differentiationIcons: Record<string, typeof Cpu> = {
    technology: Cpu,
    network_effects: Users,
    data: Zap,
    brand: Target,
    cost: DollarSign,
    regulatory: Scale,
  };

  const getGapColor = (gap?: string) => {
    switch (gap?.toLowerCase()) {
      case "leading":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "competitive":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "behind":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const timeToReplicateSteps = ["Months", "1-2 Years", "3-5 Years", "5+ Years"] as const;

  const getTimeToReplicateIndex = (time?: string): number => {
    if (!time) return -1;
    const lower = time.toLowerCase();
    if (lower.includes("month") || lower.includes("week")) return 0;
    if (lower.includes("5+") || lower.includes("5 +") || lower.includes("five+") || lower.includes("decade")) return 3;
    if (lower.includes("3") || lower.includes("three") || lower.includes("several")) return 2;
    if (lower.includes("1") || lower.includes("year") || lower.includes("two")) return 1;
    return -1;
  };

  const timeIndex = getTimeToReplicateIndex(competitivePositioning?.timeToReplicate);

  const barriers = barrierBooleans ?? { technical: false, capital: false, network: false, regulatory: false };
  const barrierItems = [
    { key: "technical" as const, label: "Technical", icon: Cpu },
    { key: "capital" as const, label: "Capital", icon: DollarSign },
    { key: "network" as const, label: "Network", icon: Users },
    { key: "regulatory" as const, label: "Regulatory", icon: Scale },
  ];
  const barrierCount = barrierItems.filter((b) => barriers[b.key]).length;

  // Build compact competitor cards from detailed data, falling back to names
  const directCards = directCompetitors.length > 0
    ? directCompetitors
    : directNames.map((name) => ({
        name,
        website: "",
        description: "",
        foundingYear: null,
        headquarters: null,
        employeeCount: null,
        funding: { totalRaised: null, lastRound: null, lastRoundDate: null, keyInvestors: [] },
        product: { keyFeatures: [], pricingTiers: null, targetSegment: "" },
        marketPosition: { estimatedRevenue: null, customerBase: null, marketShare: null },
        recentActivity: [],
        strengths: [],
        weaknesses: [],
        sources: [],
      }));

  const indirectCards = indirectCompetitors.length > 0
    ? indirectCompetitors.filter((c): c is IndirectCompetitor => "name" in c && "threatLevel" in c)
    : indirectNames.map((name) => ({
        name,
        website: "",
        description: "",
        threatLevel: "medium" as const,
        whyIndirect: "",
        funding: null,
        strengths: [],
        sources: [],
      }));

  return (
    <div className="space-y-6" data-testid="section-basic-landscape">
      {/* Score Card */}
      {score !== null && score !== undefined && (
        <SectionScoreCard
          title="Competitive Advantage Score"
          score={score}
          weight={weight}
          confidence={confidence ?? "unknown"}
          scoringBasis={scoringBasis}
          subScores={subScores}
          dataTestId="card-competitive-score"
          scoreTestId="text-competitive-score"
          confidenceTestId="badge-competitive-confidence"
        />
      )}

      {/* Fix #1: Strategic Positioning with differentiationType + durability badges */}
      {(competitivePositioning?.differentiationType ||
        competitivePositioning?.differentiationDurability ||
        competitivePositioning?.differentiationSummary ||
        competitivePositioning?.uniqueValueProposition) && (
        <Card data-testid="card-positioning">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-balance">
              <Target className="h-5 w-5 text-primary" />
              Strategic Positioning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {competitivePositioning?.differentiationType && (() => {
                const DiffIcon = differentiationIcons[competitivePositioning.differentiationType.toLowerCase()] ?? Target;
                return (
                  <div
                    className={cn(
                      "rounded-lg border border-l-4 p-3 space-y-1",
                      getDifferentiationBorderColor(competitivePositioning.differentiationType),
                    )}
                    data-testid="badge-differentiation-type"
                  >
                    <p className="text-xs font-medium text-muted-foreground">Differentiation</p>
                    <div className="flex items-center gap-1.5">
                      <DiffIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold capitalize">
                        {competitivePositioning.differentiationType.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                );
              })()}
              {competitivePositioning?.differentiationDurability && (
                <div
                  className={cn(
                    "rounded-lg border border-l-4 p-3 space-y-1",
                    getDurabilityBorderColor(competitivePositioning.differentiationDurability),
                  )}
                  data-testid="badge-durability"
                >
                  <p className="text-xs font-medium text-muted-foreground">Durability</p>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold capitalize">
                      {competitivePositioning.differentiationDurability}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {competitivePositioning?.differentiationSummary && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Differentiation
                </p>
                <MarkdownText className="text-sm text-pretty [&>p]:mb-0" data-testid="text-differentiation">
                  {competitivePositioning.differentiationSummary}
                </MarkdownText>
              </div>
            )}
            {competitivePositioning?.uniqueValueProposition && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Unique Value Proposition
                </p>
                <MarkdownText className="text-sm text-pretty [&>p]:mb-0" data-testid="text-value-prop">
                  {competitivePositioning.uniqueValueProposition}
                </MarkdownText>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fix #6: Direct Competitors — compact cards */}
      {directCards.length > 0 && (
        <Card data-testid="card-direct-competitors-basic">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-balance">
              <Target className="h-4 w-4 text-destructive" />
              Direct Competitors ({directCards.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="list-direct-competitor-names">
              {directCards.map((c, i) => (
                <CompactCompetitorCard key={`${c.name}-${i}`} name={c.name} description={c.description} funding={c.funding.totalRaised} website={c.website} index={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fix #6: Indirect Competitors — compact cards with threat level */}
      {indirectCards.length > 0 && (
        <Card data-testid="card-indirect-competitors-basic">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-balance">
              <Shield className="h-4 w-4 text-amber-500" />
              Indirect Competitors ({indirectCards.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="list-indirect-competitor-names">
              {indirectCards.map((c, i) => (
                <CompactCompetitorCard
                  key={`${c.name}-${i}`}
                  name={c.name}
                  description={c.description}
                  funding={c.funding}
                  website={c.website}
                  index={i + 100}
                  whyIndirect={c.whyIndirect}
                  threatLevel={c.threatLevel}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fix #5: Competitive Position Summary */}
      {(competitivePositioning?.currentGap ||
        competitivePositioning?.defensibleAgainstFunded != null ||
        competitivePositioning?.timeToReplicate) && (
        <Card data-testid="card-competitive-position-summary">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-balance">
              <Shield className="h-5 w-5 text-primary" />
              Competitive Position Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              {competitivePositioning?.currentGap && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Current Gap
                  </p>
                  <Badge
                    className={cn("text-xs capitalize", getGapColor(competitivePositioning.currentGap))}
                    data-testid="badge-current-gap"
                  >
                    {competitivePositioning.currentGap}
                  </Badge>
                </div>
              )}
              {competitivePositioning?.defensibleAgainstFunded != null && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Defensible Against Funded Entrant
                  </p>
                  {competitivePositioning.defensibleAgainstFunded ? (
                    <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" data-testid="badge-defensible">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Yes
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" data-testid="badge-defensible">
                      <XCircle className="h-3 w-3 mr-1" />
                      No
                    </Badge>
                  )}
                </div>
              )}
              {competitivePositioning?.timeToReplicate && timeIndex >= 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Time to Replicate
                  </p>
                  <div className="flex items-center gap-1" data-testid="indicator-time-to-replicate">
                    {timeToReplicateSteps.map((step, i) => {
                      const filled = i <= timeIndex;
                      const stepColors = [
                        "bg-red-400 dark:bg-red-500",
                        "bg-amber-400 dark:bg-amber-500",
                        "bg-lime-400 dark:bg-lime-500",
                        "bg-green-500 dark:bg-green-600",
                      ];
                      return (
                        <Tooltip key={step}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "h-5 w-8 rounded-sm",
                                filled ? stepColors[i] : "bg-muted",
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{step}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    <span className="ml-2 text-xs text-muted-foreground">{competitivePositioning.timeToReplicate}</span>
                  </div>
                </div>
              )}
            </div>
            {competitivePositioning?.gapEvidence && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Gap Evidence
                </p>
                <MarkdownText className="text-sm text-pretty [&>p]:mb-0" data-testid="text-gap-evidence">
                  {competitivePositioning.gapEvidence}
                </MarkdownText>
              </div>
            )}
            {competitivePositioning?.defensibilityRationale && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Defensibility Rationale
                </p>
                <MarkdownText className="text-sm text-pretty [&>p]:mb-0" data-testid="text-defensibility-rationale">
                  {competitivePositioning.defensibilityRationale}
                </MarkdownText>
              </div>
            )}
            {vulnerabilities.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Vulnerabilities
                </p>
                <ul className="space-y-1.5 text-sm">
                  {vulnerabilities.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex items-start gap-2 text-pretty"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                      <MarkdownText className="inline text-muted-foreground [&>p]:inline [&>p]:mb-0">
                        {item}
                      </MarkdownText>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 4: Barriers to Entry — 2x2 grid with checkmark/X */}
      <Card data-testid="card-barriers-to-entry">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-balance">
            <Shield className="h-5 w-5 text-primary" />
            Barriers to Entry
          </CardTitle>
          <p className="text-xs text-muted-foreground text-pretty">
            What protects this company from new competition
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            <span className="tabular-nums">{barrierCount}/4</span> barriers present
          </p>
          <div className="grid grid-cols-2 gap-3">
            {barrierItems.map((b) => {
              const present = barriers[b.key];
              const Icon = b.icon;
              return (
                <div
                  key={b.key}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3",
                    present ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/40" : "bg-muted/30",
                  )}
                  data-testid={`barrier-${b.key}`}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", present ? "text-green-600 dark:text-green-400" : "text-muted-foreground/50")} />
                  <span className={cn("text-sm font-medium", present ? "text-foreground" : "text-muted-foreground/60")}>
                    {b.label}
                  </span>
                  {present ? (
                    <CheckCircle className="h-4 w-4 ml-auto text-green-600 dark:text-green-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 ml-auto text-muted-foreground/30 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Key Strengths & Key Risks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(advantages.length > 0 || keyStrengths.length > 0) && (
          <Card data-testid="card-advantages">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-balance">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Key Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2" data-testid="list-advantages">
                {(advantages.length > 0 ? advantages : keyStrengths).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    <MarkdownText className="inline text-muted-foreground text-pretty [&>p]:inline [&>p]:mb-0">{item}</MarkdownText>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {(disadvantages.length > 0 || keyRisks.length > 0) && (
          <Card data-testid="card-disadvantages">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-balance">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Key Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2" data-testid="list-disadvantages">
                {(disadvantages.length > 0 ? disadvantages : keyRisks).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <MarkdownText className="inline text-muted-foreground text-pretty [&>p]:inline [&>p]:mb-0">{item}</MarkdownText>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function CompetitorAnalysis({
  productDefinition,
  directCompetitors = [],
  indirectCompetitors = [],
  hyperscalers = [],
  marketLandscape,
  sourceSummary,
  companyName,
  basicLandscape,
  positioning,
  competitivePositioning,
  barrierBooleans,
  keyStrengths = [],
  keyRisks = [],
  competitiveAdvantageScore,
  competitiveAdvantageWeight,
  competitiveAdvantageConfidence = "unknown",
  subScores,
  scoringBasis,
  forcePrint = false,
}: CompetitorAnalysisProps) {
  const hasDetailedCompetitorData =
    directCompetitors.length > 0 ||
    indirectCompetitors.length > 0 ||
    hyperscalers.length > 0;
  const hasBasicCompetitorData =
    (basicLandscape?.directCompetitors?.length || 0) > 0 ||
    (basicLandscape?.indirectCompetitors?.length || 0) > 0;
  const hasAnyData =
    hasDetailedCompetitorData ||
    hasBasicCompetitorData ||
    marketLandscape ||
    positioning ||
    competitivePositioning;

  if (!hasAnyData) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center"
        data-testid="section-no-competitor-data"
      >
        <Building2 className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-2 text-balance" data-testid="text-no-data-title">
          No Competitor Data Available
        </h3>
        <p className="text-sm text-muted-foreground max-w-md text-pretty" data-testid="text-no-data-description">
          Competitor analysis data will appear here once the AI evaluation has completed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {productDefinition && (
        <ProductDefinitionCard
          definition={productDefinition}
          companyName={companyName}
        />
      )}

      {marketLandscape && (
        <MarketLandscapeCard landscape={marketLandscape} />
      )}

      {!forcePrint && sourceSummary && (
        <SourcesCard sources={sourceSummary} />
      )}

      {basicLandscape && (
        <BasicCompetitorLandscapeCard
          landscape={basicLandscape}
          competitivePositioning={competitivePositioning}
          barrierBooleans={barrierBooleans}
          directCompetitors={directCompetitors as DirectCompetitor[]}
          indirectCompetitors={indirectCompetitors}
          keyStrengths={keyStrengths}
          keyRisks={keyRisks}
          score={competitiveAdvantageScore ?? undefined}
          weight={competitiveAdvantageWeight}
          confidence={competitiveAdvantageConfidence}
          subScores={subScores}
          scoringBasis={scoringBasis}
        />
      )}
    </div>
  );
}
