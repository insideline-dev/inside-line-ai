import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Package, 
  Image, 
  Code, 
  Layers, 
  Database,
  Server,
  Globe,
  Cpu,
  Cloud,
  Sparkles,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useState } from "react";
import type { Startup, StartupEvaluation } from "@shared/schema";
import { ProductScoreSummary } from "@/components/ProductScoreSummary";

interface ProductTabContentProps {
  startup: Startup;
  evaluation: StartupEvaluation | null;
  showScores?: boolean;
  productWeight?: number;
}

interface ExtractedFeature {
  name: string;
  description?: string;
  source: string;
}

interface ExtractedTech {
  technology: string;
  category?: string;
  source: string;
}

function getTechCategoryIcon(category: string | undefined) {
  switch (category?.toLowerCase()) {
    case "frontend":
      return <Globe className="w-3 h-3" />;
    case "backend":
      return <Server className="w-3 h-3" />;
    case "database":
      return <Database className="w-3 h-3" />;
    case "infrastructure":
      return <Cloud className="w-3 h-3" />;
    case "ai_ml":
      return <Sparkles className="w-3 h-3" />;
    default:
      return <Code className="w-3 h-3" />;
  }
}

export function ProductTabContent({ startup, evaluation, showScores = true, productWeight }: ProductTabContentProps) {
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0);
  
  const founderScreenshots = (startup.productScreenshots as string[]) || [];
  const extractedFeatures = (evaluation?.extractedFeatures as ExtractedFeature[]) || [];
  const extractedTechStack = (evaluation?.extractedTechStack as ExtractedTech[]) || [];
  const aiExtractedScreenshots = (evaluation?.extractedScreenshots as { url: string; source: string; caption?: string }[]) || [];
  
  const allScreenshots = [
    ...founderScreenshots.map(url => ({ url, source: "founder" as const, caption: undefined })),
    ...aiExtractedScreenshots.filter(s => !founderScreenshots.includes(s.url))
  ];
  
  const productData = evaluation?.productData as any;
  const productScore = evaluation?.productScore;
  const trlStage = startup.technologyReadinessLevel || productData?.technologyReadiness?.stage;
  const productSummary = evaluation?.productSummary || productData?.productSummary || productData?.one_liner;
  
  const hasContent = allScreenshots.length > 0 || 
    extractedFeatures.length > 0 || 
    extractedTechStack.length > 0 ||
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
          moatType={productData?.competitiveMoat?.moatType}
          moatStrength={productData?.competitiveMoat?.strength}
          keyStrengths={productData?.keyStrengths}
          keyRisks={productData?.keyRisks}
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

      {allScreenshots.length > 0 && (
        <Card className="border-primary/20" data-testid="card-product-showcase">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="w-5 h-5" />
              <span data-testid="text-product-showcase-title">Product Showcase</span>
            </CardTitle>
            <CardDescription data-testid="text-product-showcase-description">
              Screenshots and diagrams
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <img
                  src={allScreenshots[currentScreenshotIndex]?.url}
                  alt={allScreenshots[currentScreenshotIndex]?.caption || `Product screenshot ${currentScreenshotIndex + 1}`}
                  className="w-full h-full object-contain"
                  data-testid={`img-screenshot-${currentScreenshotIndex}`}
                />
              </div>
              
              <div className="flex items-center justify-between mt-2">
                <Badge variant="outline" className="text-xs">
                  {allScreenshots[currentScreenshotIndex]?.source === "founder" 
                    ? "Submitted by founder" 
                    : `From ${allScreenshots[currentScreenshotIndex]?.source || "AI analysis"}`}
                </Badge>
                {allScreenshots[currentScreenshotIndex]?.caption && (
                  <span className="text-xs text-muted-foreground">
                    {allScreenshots[currentScreenshotIndex].caption}
                  </span>
                )}
              </div>
              
              {allScreenshots.length > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentScreenshotIndex(prev => 
                      prev === 0 ? allScreenshots.length - 1 : prev - 1
                    )}
                    data-testid="button-prev-screenshot"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  
                  <div className="flex gap-2">
                    {allScreenshots.map((_, idx) => (
                      <button
                        key={idx}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          idx === currentScreenshotIndex 
                            ? "bg-primary" 
                            : "bg-muted-foreground/30"
                        }`}
                        onClick={() => setCurrentScreenshotIndex(idx)}
                        data-testid={`button-screenshot-dot-${idx}`}
                      />
                    ))}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentScreenshotIndex(prev => 
                      prev === allScreenshots.length - 1 ? 0 : prev + 1
                    )}
                    data-testid="button-next-screenshot"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            
            {allScreenshots.length > 1 && (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-4">
                {allScreenshots.map((screenshot, idx) => (
                  <button
                    key={idx}
                    className={`aspect-video rounded-md overflow-hidden border-2 transition-colors ${
                      idx === currentScreenshotIndex 
                        ? "border-primary" 
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                    onClick={() => setCurrentScreenshotIndex(idx)}
                    data-testid={`button-thumbnail-${idx}`}
                  >
                    <img
                      src={screenshot.url}
                      alt={screenshot.caption || `Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {extractedFeatures.length > 0 && (
        <Card data-testid="card-key-features">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Key Features</span>
            </CardTitle>
            <CardDescription>
              Product capabilities extracted from pitch deck and website
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {extractedFeatures.map((feature, idx) => (
                <div 
                  key={idx}
                  className="p-3 rounded-lg border bg-muted/30"
                  data-testid={`feature-${idx}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium">{feature.name}</h4>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {feature.source}
                    </Badge>
                  </div>
                  {feature.description && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {feature.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {extractedTechStack.length > 0 && (
        <Card data-testid="card-tech-stack">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code className="w-5 h-5" />
              <span>Technology Stack</span>
            </CardTitle>
            <CardDescription>
              Technologies and frameworks used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {extractedTechStack.map((tech, idx) => (
                <Badge 
                  key={idx}
                  variant="secondary"
                  className="flex items-center gap-1 px-3 py-1"
                  data-testid={`tech-${idx}`}
                >
                  {getTechCategoryIcon(tech.category)}
                  {tech.technology}
                </Badge>
              ))}
            </div>
            
            <div className="mt-4 text-xs text-muted-foreground">
              <span className="font-medium">Sources:</span>{" "}
              {Array.from(new Set(extractedTechStack.map(t => t.source))).join(", ")}
            </div>
          </CardContent>
        </Card>
      )}

      {productData?.product_features && (
        <Card data-testid="card-product-features">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>Product Features</span>
            </CardTitle>
            <CardDescription>
              Core capabilities and functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(productData.product_features).map(([category, features]: [string, any]) => (
              <div key={category}>
                <h4 className="font-medium mb-2 capitalize">{category.replace(/_/g, ' ')}</h4>
                <ul className="space-y-1">
                  {(features as string[]).slice(0, 5).map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {productData?.technology_readiness && (
        <Card data-testid="card-technology-readiness">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-5 h-5" />
              <span>Technology Readiness</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {productData.technology_readiness.stage_assessment && (
              <div>
                <h4 className="font-medium mb-2">Stage Assessment</h4>
                <p className="text-sm text-muted-foreground">
                  {productData.technology_readiness.stage_assessment}
                </p>
              </div>
            )}
            {productData.technology_readiness.supporting_signals?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Supporting Signals</h4>
                <ul className="space-y-1">
                  {productData.technology_readiness.supporting_signals.map((signal: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2 shrink-0" />
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {productData.technology_readiness.risks_or_unknowns?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Risks & Unknowns</h4>
                <ul className="space-y-1">
                  {productData.technology_readiness.risks_or_unknowns.map((risk: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {productData?.architecture_and_stack_inference && (
        <Card data-testid="card-architecture">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code className="w-5 h-5" />
              <span>Architecture & Technology</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {productData.architecture_and_stack_inference.stated_architecture && (
              <div className="space-y-3">
                {Object.entries(productData.architecture_and_stack_inference.stated_architecture).map(([key, value]: [string, any]) => (
                  <div key={key}>
                    <h4 className="font-medium text-sm capitalize">{key.replace(/_/g, ' ')}</h4>
                    <p className="text-sm text-muted-foreground">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {productData.architecture_and_stack_inference.likely_tech_components?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Likely Technologies</h4>
                <div className="flex flex-wrap gap-2">
                  {productData.architecture_and_stack_inference.likely_tech_components.map((tech: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {tech}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
