// DS-E6-F2-S1 — pill bar showing the investor's thesis sub-axes
// (industries) and letting them focus the feed on one. Clicking a pill
// sets `thesisAxis` in the global filter store; clicking it again clears.
//
// Hidden when the investor has no industries declared on their thesis.
// Read-only — the source-of-truth is the thesis editor.

import { useInvestorControllerGetThesis } from "@/api/generated/investor/investor";
import { useFilterStore } from "@/stores";
import type { InvestmentThesis } from "@/types/investor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function unwrap<T>(payload: unknown): T | undefined {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T | undefined;
}

interface ThesisAxisFilterProps {
  className?: string;
}

export function ThesisAxisFilter({ className }: ThesisAxisFilterProps) {
  const thesisAxis = useFilterStore((s) => s.thesisAxis);
  const setThesisAxis = useFilterStore((s) => s.setThesisAxis);

  const { data, isLoading } = useInvestorControllerGetThesis({
    query: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const thesis = unwrap<InvestmentThesis>(data) ?? null;
  const axes = (thesis?.industries ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );

  if (isLoading || axes.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        className,
      )}
      data-testid="thesis-axis-filter"
    >
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        Thesis axis:
      </span>
      {axes.map((axis) => {
        const isActive =
          thesisAxis !== null &&
          thesisAxis.toLowerCase() === axis.toLowerCase();
        return (
          <Button
            key={axis}
            variant={isActive ? "default" : "outline"}
            size="sm"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setThesisAxis(isActive ? null : axis)}
            data-testid={`thesis-axis-${axis}`}
          >
            {axis}
          </Button>
        );
      })}
      {thesisAxis !== null && (
        <Badge
          variant="secondary"
          className="cursor-pointer gap-1 text-[10px]"
          onClick={() => setThesisAxis(null)}
        >
          Clear
          <X className="h-3 w-3" />
        </Badge>
      )}
    </div>
  );
}

/**
 * Pure filter helper — exported so the investor pipeline list can apply the
 * same logic without duplicating it. Returns true when a startup matches the
 * currently-selected axis (or when no axis is selected).
 */
export function matchesThesisAxis(
  startup: { industry?: string; sectorIndustry?: string; sectorIndustryGroup?: string },
  axis: string | null,
): boolean {
  if (!axis) return true;
  const a = axis.toLowerCase();
  const fields = [startup.industry, startup.sectorIndustry, startup.sectorIndustryGroup]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  return fields.some((f) => f === a || f.includes(a) || a.includes(f));
}
