import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Image, Code, Layers } from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import { ProductScoreSummary } from "@/components/ProductScoreSummary";

interface ProductTabContentProps {
  startup: Startup;
  evaluation: Evaluation | null;
  showScores?: boolean;
  productWeight?: number;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function normalizeTrlStage(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["idea", "mvp", "scaling", "mature"].includes(normalized)) return normalized;
  if (normalized.includes("ga") || normalized.includes("production")) return "mature";
  return undefined;
}

export function ProductTabContent({ startup, evaluation, showScores = true, productWeight }: ProductTabContentProps) {
  const founderScreenshots = (startup.productScreenshots as string[]) || [];

  const productData = evaluation?.productData as any;
  const productScore = evaluation?.productScore;
  const competitiveData = (evaluation?.competitiveAdvantageData as any) || {};
  const trlStage = normalizeTrlStage(
    startup.technologyReadinessLevel ||
      productData?.technologyReadiness?.stage ||
      productData?.technologyStage ||
      productData?.productMaturity,
  );
  const moatType =
    productData?.competitiveMoat?.moatType ||
    productData?.moatType ||
    (Array.isArray(competitiveData?.moats) && competitiveData.moats.length > 0
      ? String(competitiveData.moats[0])
      : undefined);
  const moatStrength =
    productData?.competitiveMoat?.strength ??
    productData?.moatStrength ??
    null;
  const productStrengths = dedupeStrings(
    [
      ...toStringArray(productData?.keyStrengths),
      ...toStringArray(productData?.keyFindings),
    ].filter(Boolean),
  );
  const productRisks = dedupeStrings(
    [
      ...toStringArray(productData?.keyRisks),
      ...toStringArray(productData?.risks),
      ...toStringArray(productData?.dataGaps),
    ].filter(Boolean),
  );
  const productSummary = evaluation?.productSummary || productData?.productDescription || productData?.narrativeSummary;
  const keyFeatures = toStringArray(productData?.keyFeatures);
  const technologyStack = toStringArray(productData?.technologyStack);

  const hasContent =
    founderScreenshots.length > 0 ||
    keyFeatures.length > 0 ||
    technologyStack.length > 0 ||
    trlStage ||
    productSummary ||
    productData;

  if (!hasContent) {
    return (
      <Card className="border-dashed" data-testid="card-product-empty">
        <CardContent className="p-12 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2" data-testid="text-no-product-title">No product data</h3>
          <p className="text-muted-foreground" data-testid="text-no-product-message">
            Product information has not been submitted or analyzed yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="product-tab-content">
      {evaluation && showScores && (
        <ProductScoreSummary
          productScore={productScore || 0}
          productSummary={productSummary}
          trlStage={trlStage}
          moatType={moatType}
          moatStrength={moatStrength}
          keyStrengths={productStrengths}
          keyRisks={productRisks}
          weight={productWeight}
        />
      )}

      {!showScores && productSummary && (
        <Card className="border-primary/20" data-testid="card-product-summary">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span data-testid="text-product-summary-title">Product Summary</span>
            </CardTitle>
            <CardDescription data-testid="text-product-summary-description">
              What this product does
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{productSummary}</p>
          </CardContent>
        </Card>
      )}

      {(productData?.productDescription || productData?.uniqueValue) && (
        <Card className="border-primary/20" data-testid="card-product-overview">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-5 h-5" />
              <span>Product Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {productData?.productDescription && (
              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{productData.productDescription}</p>
              </div>
            )}
            {productData?.uniqueValue && (
              <div>
                <h4 className="text-sm font-medium mb-1">Unique Value</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{productData.uniqueValue}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {founderScreenshots.length > 0 && (
        <Card className="border-primary/20" data-testid="card-product-showcase">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="w-5 h-5" />
              <span data-testid="text-product-showcase-title">Product Showcase</span>
            </CardTitle>
            <CardDescription data-testid="text-product-showcase-description">
              Screenshots submitted by founder
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {founderScreenshots.map((url, idx) => (
                <div key={idx} className="aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={url}
                    alt={`Product screenshot ${idx + 1}`}
                    className="w-full h-full object-contain"
                    data-testid={`img-screenshot-${idx}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {keyFeatures.length > 0 && (
        <Card data-testid="card-key-features">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Key Features</span>
            </CardTitle>
            <CardDescription>Core capabilities identified from analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {keyFeatures.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {technologyStack.length > 0 && (
        <Card data-testid="card-tech-stack">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code className="w-5 h-5" />
              <span>Technology Stack</span>
            </CardTitle>
            <CardDescription>Technologies and frameworks used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {technologyStack.map((tech, idx) => (
                <Badge key={idx} variant="secondary" className="px-3 py-1">
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
