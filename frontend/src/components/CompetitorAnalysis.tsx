import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
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
  Lightbulb,
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
  positioningRecommendation?: string;
  currentGap?: string;
  vulnerabilities?: string[];
  defensibleAgainstFunded?: boolean | null;
  differentiationType?: string;
  differentiationDurability?: string;
  moatStage?: string;
  moatEvidence?: string[];
  moatSelfReinforcing?: boolean | null;
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
  keyStrengths?: string[];
  keyRisks?: string[];
  competitiveAdvantageScore?: number | null;
  competitiveAdvantageWeight?: number;
  competitiveAdvantageConfidence?: string;
  subScores?: Array<{ dimension: string; weight: number; score: number }>;
  scoringBasis?: string;
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
          <p className="text-sm text-pretty" data-testid="text-core-offering">
            {definition?.coreOffering || "Not specified"}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">
            Value Proposition
          </p>
          <p className="text-sm text-pretty" data-testid="text-value-proposition">
            {definition?.valueProposition || "Not specified"}
          </p>
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
              {competitor?.name || "Unknown Competitor"}
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
        <p
          className="text-sm text-muted-foreground text-pretty"
          data-testid={`text-competitor-description-${index}`}
        >
          {competitor?.description || "No description available"}
        </p>

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
                    <span className="font-medium">{funding.totalRaised}</span>
                  </div>
                )}
                {funding.lastRound && (
                  <div>
                    <span className="text-muted-foreground">Last: </span>
                    <span className="font-medium">{funding.lastRound}</span>
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
                  Investors: {keyInvestors.slice(0, 3).join(", ")}
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
                Target: {product.targetSegment}
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
                  • {s}
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
                  • {w}
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
                  • {activity}
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
              {competitor?.name || "Unknown Competitor"}
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
        <p
          className="text-sm text-muted-foreground text-pretty"
          data-testid={`text-indirect-description-${index}`}
        >
          {competitor?.description || "No description available"}
        </p>

        <div className="p-2 bg-muted/50 rounded text-xs text-pretty">
          <span className="font-medium">Why indirect: </span>
          <span className="text-muted-foreground">
            {competitor?.whyIndirect || "Not specified"}
          </span>
        </div>

        {competitor?.funding && (
          <div className="flex items-center gap-1.5 text-sm">
            <DollarSign className="h-3.5 w-3.5 text-green-600" />
            <span>Funding: {competitor.funding}</span>
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
                  • {s}
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
                  <span className="text-muted-foreground text-pretty">
                    {trend}
                  </span>
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
                  <span className="text-muted-foreground text-pretty">
                    {threat}
                  </span>
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
                  <span className="text-muted-foreground text-pretty">
                    {source}
                  </span>
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
                  <span className="text-muted-foreground text-pretty">
                    {gap}
                  </span>
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

function CompetitorLink({ name, index }: { name: string; index: number }) {
  const websiteUrl = getCompetitorWebsite(name);
  return (
    <a
      href={websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors text-sm"
      data-testid={`link-competitor-${index}`}
    >
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <span>{name}</span>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}

function renderTextValue(value?: string | null): string {
  if (!value || value.trim().length === 0) return "Not provided";
  return value;
}

function renderBooleanBadge(
  value: boolean | null | undefined,
  labels: { trueLabel: string; falseLabel: string; unknownLabel?: string },
) {
  if (value === true) {
    return (
      <Badge variant="default" className="text-xs">
        {labels.trueLabel}
      </Badge>
    );
  }
  if (value === false) {
    return (
      <Badge variant="secondary" className="text-xs">
        {labels.falseLabel}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      {labels.unknownLabel ?? "Not provided"}
    </Badge>
  );
}

function BasicCompetitorLandscapeCard({
  landscape,
  positioning,
  competitivePositioning,
  barriersToEntry,
  keyStrengths = [],
  keyRisks = [],
  score,
  weight,
  confidence,
  subScores,
  scoringBasis,
}: {
  landscape: BasicCompetitorLandscape;
  positioning?: {
    strategy?: string;
    differentiation?: string;
    uniqueValueProp?: string;
  } | null;
  competitivePositioning?: CompetitivePositioning | null;
  barriersToEntry?: BarriersToEntry | null;
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
  const moatEvidence = competitivePositioning?.moatEvidence || [];

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600";
    if (s >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getDifferentiationColor = (strength?: string) => {
    switch (strength) {
      case "strong":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "moderate":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case "weak":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStrategyDescription = (strategy?: string) => {
    switch (strategy?.toLowerCase()) {
      case "blue ocean":
        return "Creating new market space with little to no direct competition";
      case "red ocean":
        return "Competing in existing markets with established players";
      case "niche":
        return "Focusing on a specific segment within a larger market";
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6" data-testid="section-basic-landscape">
      {score !== null && score !== undefined && (
        <Card
          className="border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background"
          data-testid="card-competitive-score"
        >
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-primary/10">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-balance">
                    Competitive Advantage Score
                  </h3>
                  <p className="text-sm text-muted-foreground text-pretty">
                    {weight !== undefined ? `${weight}%` : ""} weight in overall
                    evaluation
                  </p>
                  <ConfidenceBadge
                    confidence={confidence ?? "unknown"}
                    className="mt-2"
                    dataTestId="badge-competitive-confidence"
                  />
                </div>
              </div>
              <div className="text-right">
                <span
                  className={cn(
                    "text-4xl font-bold tabular-nums",
                    getScoreColor(score),
                  )}
                  data-testid="text-competitive-score"
                >
                  {score}
                </span>
                <span className="text-lg text-muted-foreground">/100</span>
              </div>
            </div>

            {(scoringBasis || (subScores && subScores.length > 0)) && (
              <div className="mt-5 space-y-4 border-t border-border/60 pt-4">
                {scoringBasis && <p className="text-sm text-muted-foreground">{scoringBasis}</p>}
              </div>
            )}
            {subScores && subScores.length > 0 && (
              <div className="mt-3 space-y-3">
                {subScores.map((item) => {
                  const pct = item.weight <= 1 ? item.weight * 100 : item.weight;
                  const pctLabel = `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
                  const barColor = item.score >= 80 ? "bg-emerald-500" : item.score >= 60 ? "bg-amber-500" : "bg-rose-500";
                  return (
                    <div key={item.dimension} className="grid grid-cols-[minmax(0,1fr)_48px] gap-3">
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium">{item.dimension}</span>
                          <span className="text-muted-foreground">{pctLabel}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, item.score))}%` }} />
                        </div>
                      </div>
                      <div className="text-right text-xs font-medium">{Math.round(item.score)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {positioning && (
        <Card data-testid="card-positioning">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-balance">
              <Target className="h-5 w-5 text-primary" />
              Strategic Positioning
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {positioning.strategy && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Market Strategy
                  </p>
                  <Badge
                    variant="outline"
                    className="capitalize mb-2"
                    data-testid="badge-strategy"
                  >
                    {positioning.strategy}
                  </Badge>
                  {getStrategyDescription(positioning.strategy) && (
                    <p className="text-xs text-muted-foreground mt-1 text-pretty">
                      {getStrategyDescription(positioning.strategy)}
                    </p>
                  )}
                </div>
              )}
              {competitivePositioning?.differentiationStrength && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Differentiation Strength
                  </p>
                  <Badge
                    className={cn(
                      "capitalize",
                      getDifferentiationColor(
                        competitivePositioning.differentiationStrength,
                      ),
                    )}
                    data-testid="badge-differentiation-strength"
                  >
                    {competitivePositioning.differentiationStrength}
                  </Badge>
                </div>
              )}
            </div>
            {positioning.differentiation && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Differentiation
                </p>
                <p className="text-sm text-pretty" data-testid="text-differentiation">
                  {positioning.differentiation}
                </p>
              </div>
            )}
            {positioning.uniqueValueProp && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Unique Value Proposition
                </p>
                <p className="text-sm text-pretty" data-testid="text-value-prop">
                  {positioning.uniqueValueProp}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {competitivePositioning?.positioningRecommendation && (
        <Card
          className="border-primary/30 bg-primary/5"
          data-testid="card-strategic-recommendation"
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-balance">
              <Lightbulb className="h-5 w-5 text-primary" />
              Strategic Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-sm leading-relaxed text-pretty"
              data-testid="text-strategic-recommendation"
            >
              {competitivePositioning.positioningRecommendation}
            </p>
          </CardContent>
        </Card>
      )}

      <Card
        className="border-primary/15"
        data-testid="card-competitive-signals"
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-balance">
            <Shield className="h-5 w-5 text-primary" />
            Competitive Signals
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Detailed moat and positioning indicators from competitive evaluation
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Differentiation Type
              </p>
              <p
                className="text-sm capitalize text-pretty"
                data-testid="text-differentiation-type"
              >
                {renderTextValue(competitivePositioning?.differentiationType)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Differentiation Durability
              </p>
              <p
                className="text-sm text-pretty"
                data-testid="text-differentiation-durability"
              >
                {renderTextValue(
                  competitivePositioning?.differentiationDurability,
                )}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Moat Stage
              </p>
              <p className="text-sm text-pretty" data-testid="text-moat-stage">
                {renderTextValue(competitivePositioning?.moatStage)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Self-Reinforcing Moat
              </p>
              {renderBooleanBadge(competitivePositioning?.moatSelfReinforcing, {
                trueLabel: "Yes",
                falseLabel: "No",
              })}
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 md:col-span-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Current Competitive Gap
              </p>
              <p className="text-sm text-pretty" data-testid="text-current-gap">
                {renderTextValue(competitivePositioning?.currentGap)}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Defensible Against Funded Competitors
              </p>
              {renderBooleanBadge(
                competitivePositioning?.defensibleAgainstFunded,
                {
                  trueLabel: "Defensible",
                  falseLabel: "Not defensible",
                },
              )}
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Vulnerabilities
              </p>
              {vulnerabilities.length > 0 ? (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {vulnerabilities.slice(0, 4).map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex items-start gap-2 text-pretty"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Not provided</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Moat Evidence
            </p>
            {moatEvidence.length > 0 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {moatEvidence.slice(0, 5).map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex items-start gap-2 text-pretty"
                    data-testid={`text-moat-evidence-${index}`}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mt-0.5 text-green-600 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No moat evidence provided</p>
            )}
          </div>
        </CardContent>
      </Card>

      {barriersToEntry &&
        (barriersToEntry.technical ||
          barriersToEntry.regulatory ||
          barriersToEntry.capital ||
          barriersToEntry.network) && (
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
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {barriersToEntry.technical && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Technical
                    </p>
                    <p
                      className="text-sm text-pretty"
                      data-testid="text-barrier-technical"
                    >
                      {barriersToEntry.technical}
                    </p>
                  </div>
                )}
                {barriersToEntry.capital && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Capital Requirements
                    </p>
                    <p
                      className="text-sm text-pretty"
                      data-testid="text-barrier-capital"
                    >
                      {barriersToEntry.capital}
                    </p>
                  </div>
                )}
                {barriersToEntry.network && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Network Effects
                    </p>
                    <p
                      className="text-sm text-pretty"
                      data-testid="text-barrier-network"
                    >
                      {barriersToEntry.network}
                    </p>
                  </div>
                )}
                {barriersToEntry.regulatory && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Regulatory
                    </p>
                    <p
                      className="text-sm text-pretty"
                      data-testid="text-barrier-regulatory"
                    >
                      {barriersToEntry.regulatory}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {directNames.length > 0 && (
          <Card data-testid="card-direct-competitors-basic">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-balance">
                <Target className="h-4 w-4 text-destructive" />
                Direct Competitors ({directNames.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 text-pretty">
                Click to search for more information
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2" data-testid="list-direct-competitor-names">
                {directNames.map((name, i) => (
                  <CompetitorLink key={i} name={name} index={i} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {indirectNames.length > 0 && (
          <Card data-testid="card-indirect-competitors-basic">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-balance">
                <Shield className="h-4 w-4 text-amber-500" />
                Indirect Competitors ({indirectNames.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 text-pretty">
                Click to search for more information
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2" data-testid="list-indirect-competitor-names">
                {indirectNames.map((name, i) => (
                  <CompetitorLink key={i} name={name} index={i + 100} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(advantages.length > 0 || keyStrengths.length > 0) && (
          <Card data-testid="card-advantages">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-balance">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Competitive Advantages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2" data-testid="list-advantages">
                {(advantages.length > 0 ? advantages : keyStrengths).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground text-pretty">{item}</span>
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
                Competitive Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-2" data-testid="list-disadvantages">
                {(disadvantages.length > 0 ? disadvantages : keyRisks).map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground text-pretty">{item}</span>
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
  barriersToEntry,
  keyStrengths = [],
  keyRisks = [],
  competitiveAdvantageScore,
  competitiveAdvantageWeight,
  competitiveAdvantageConfidence = "unknown",
  subScores,
  scoringBasis,
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

  const competitiveData = {
    productDefinition,
    competitorProfiles: directCompetitors,
    indirectCompetitorProfiles: indirectCompetitors,
    marketLandscape,
    sourceSummary,
    competitorLandscape: basicLandscape,
    positioning,
    competitivePositioning,
    barriersToEntry,
    keyStrengths,
    keyRisks,
  };

  return (
    <div className="space-y-6">
      {competitiveData.productDefinition && (
        <ProductDefinitionCard
          definition={competitiveData.productDefinition}
          companyName={companyName}
        />
      )}

      {competitiveData.marketLandscape && (
        <MarketLandscapeCard landscape={competitiveData.marketLandscape} />
      )}

      {competitiveData.sourceSummary && (
        <SourcesCard sources={competitiveData.sourceSummary} />
      )}

      {basicLandscape && (
        <BasicCompetitorLandscapeCard
          landscape={basicLandscape}
          positioning={positioning}
          competitivePositioning={competitivePositioning}
          barriersToEntry={barriersToEntry}
          keyStrengths={keyStrengths}
          keyRisks={keyRisks}
          score={competitiveAdvantageScore ?? undefined}
          weight={competitiveAdvantageWeight}
          confidence={competitiveAdvantageConfidence}
          subScores={subScores}
          scoringBasis={scoringBasis}
        />
      )}

      {directCompetitors.length > 0 && (
        <section className="space-y-4" data-testid="section-direct-competitor-details">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-destructive" />
            Direct Competitor Details
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {directCompetitors.map((competitor, index) => (
              <DirectCompetitorCard
                key={`${competitor.name}-${index}`}
                competitor={competitor as DirectCompetitor}
                index={index}
              />
            ))}
          </div>
        </section>
      )}

      {indirectCompetitors.length > 0 ? (
        <section className="space-y-4" data-testid="section-indirect-competitor-details">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-500" />
            Indirect Competitor Details
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {indirectCompetitors.map((competitor, index) => (
              <IndirectCompetitorCard
                key={`${(competitor as IndirectCompetitor).name || (competitor as AlternativeIndirectCompetitor).category || "indirect"}-${index}`}
                competitor={competitor as IndirectCompetitor}
                index={index}
              />
            ))}
          </div>
        </section>
      ) : (
        <Card data-testid="card-no-indirect-competitors">
          <CardContent className="py-5">
            <p className="text-sm text-muted-foreground">
              No indirect competitor profiles were returned in this analysis run.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
