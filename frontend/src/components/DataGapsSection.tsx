import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { MarkdownText } from "@/components/MarkdownText";

export interface DataGapItem {
  gap: string;
  impact: string;
  suggestedAction: string | null;
}

export function parseDataGapItems(value: unknown): DataGapItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string" && item.trim().length > 0) {
        return { gap: item.trim(), impact: "important", suggestedAction: null };
      }
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const gap =
        (typeof record.gap === "string" && record.gap.trim()) ||
        (typeof record.description === "string" && record.description.trim()) ||
        null;
      if (!gap) return null;
      return {
        gap,
        impact: (typeof record.impact === "string" && record.impact.trim()) || "important",
        suggestedAction: (typeof record.suggestedAction === "string" && record.suggestedAction.trim()) || null,
      };
    })
    .filter((item): item is DataGapItem => item !== null);
}

function impactBadgeClass(value: string): string {
  switch (value.toLowerCase()) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400";
    case "important":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";
  }
}

function formatImpactLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

interface DataGapsSectionProps {
  gaps: DataGapItem[];
  title?: string;
  emptyMessage?: string;
}

export function DataGapsSection({
  gaps,
  title = "Data Gaps & Diligence",
  emptyMessage,
}: DataGapsSectionProps) {
  if (gaps.length === 0 && !emptyMessage) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {gaps.length > 0 ? (
          <div className="space-y-3">
            {gaps.map((item, index) => (
              <div key={`${item.gap}-${index}`} className="rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <MarkdownText className="text-sm font-medium [&>p]:mb-0">{item.gap}</MarkdownText>
                  <Badge variant="outline" className={impactBadgeClass(item.impact)}>
                    {formatImpactLabel(item.impact)}
                  </Badge>
                </div>
                {item.suggestedAction && (
                  <MarkdownText className="mt-2 text-xs text-muted-foreground [&>p]:mb-0">
                    {`Suggested action: ${item.suggestedAction}`}
                  </MarkdownText>
                )}
              </div>
            ))}
          </div>
        ) : emptyMessage ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
