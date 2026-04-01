import { MarkdownText } from "@/components/MarkdownText";
import type { KpiMetrics } from "@/lib/kpi-metrics";
import { cn } from "@/lib/utils";

const KPI_ITEMS: { key: keyof KpiMetrics; label: string }[] = [
  { key: "arr", label: "ARR" },
  { key: "growthRate", label: "Growth Rate" },
  { key: "grossMargin", label: "Gross Margin" },
  { key: "marketStructure", label: "Market Structure" },
  { key: "tam", label: "TAM" },
  { key: "marketGrowth", label: "Market Growth" },
  { key: "productStage", label: "Product Stage" },
  { key: "founderMarketFit", label: "Founder–Market Fit" },
];

interface KpiGridProps {
  metrics: KpiMetrics;
  className?: string;
}

export function KpiGrid({ metrics, className }: KpiGridProps) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-3", className)}>
      {KPI_ITEMS.map(({ key, label }) => (
        <div key={key} className="rounded-lg bg-muted/50 p-3">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <MarkdownText className="text-sm font-medium mt-0.5 [&>p]:mb-0">{metrics[key]}</MarkdownText>
        </div>
      ))}
    </div>
  );
}
