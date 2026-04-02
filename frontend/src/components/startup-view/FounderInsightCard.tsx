import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Lightbulb,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MarkdownText } from "@/components/MarkdownText";

interface FounderInsightCardProps {
  title: string;
  icon: LucideIcon;
  strengths: string[];
  improvements: string[];
  unclearItems?: string[];
  trend?: "up" | "down" | "neutral";
}

export function FounderInsightCard({
  title,
  icon: Icon,
  strengths,
  improvements,
  unclearItems = [],
  trend,
}: FounderInsightCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-chart-2" : trend === "down" ? "text-chart-5" : "text-muted-foreground";

  const sectionId = title.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <Card data-testid={`card-insight-${sectionId}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="w-5 h-5" />
          <span data-testid={`text-insight-title-${sectionId}`}>{title}</span>
          {trend && (
            <TrendIcon className={`w-4 h-4 ml-auto ${trendColor}`} data-testid={`icon-trend-${sectionId}`} />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4" data-testid={`content-insight-${sectionId}`}>
        {strengths.length > 0 && (
          <div data-testid={`container-strengths-${sectionId}`}>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-chart-2" />
              <span className="text-sm font-medium text-chart-2">Strengths</span>
            </div>
            <ul className="space-y-1.5 pl-6" data-testid={`list-strengths-${sectionId}`}>
              {strengths.slice(0, 3).map((strength, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`item-strength-${sectionId}-${i}`}>
                  <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-chart-2" />
                  <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                    {strength}
                  </MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {improvements.length > 0 && (
          <div data-testid={`container-improvements-${sectionId}`}>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-chart-4" />
              <span className="text-sm font-medium text-chart-4">How to Strengthen This</span>
            </div>
            <ul className="space-y-1.5 pl-6" data-testid={`list-improvements-${sectionId}`}>
              {improvements.slice(0, 3).map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`item-improvement-${sectionId}-${i}`}>
                  <ChevronRight className="w-3 h-3 mt-1 shrink-0 text-chart-4" />
                  <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                    {item}
                  </MarkdownText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unclearItems.length > 0 && (
          <div className="pt-2 border-t" data-testid={`container-clarify-${sectionId}`}>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4" />
              <span className="text-sm font-medium">What You Can Clarify</span>
            </div>
            <ul className="space-y-1.5 pl-6" data-testid={`list-clarify-${sectionId}`}>
              {unclearItems.slice(0, 2).map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2" data-testid={`item-clarify-${sectionId}-${i}`}>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0" data-testid={`badge-action-${sectionId}-${i}`}>Action</Badge>
                  <MarkdownText inline className="inline [&>p]:inline [&>p]:mb-0">
                    {item}
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
