// DS-E9-F1-S1 — clicking a lens chip on the deal card opens a popover
// with the lens's full evidence list. Each claim that has a URL source
// is rendered as an external link (opens in a new tab). Non-URL sources
// (e.g. "deck:p3") render inline as plain text — investor still sees the
// reference, just no clickable target.
//
// Popover is the trigger; the chip itself is the click target.

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ScreeningEvidence,
  ScreeningLensV1,
} from "@/lib/screening/useScreeningOutput";

interface LensEvidencePopoverProps {
  lensLabel: string;
  /** Snapshot data shown in the chip itself (always present). */
  scoreLabel: string | null;
  /** Triggering element — usually the lens chip. */
  children: React.ReactNode;
  /** Full lens output if loaded; null when no screening yet. */
  lens?: ScreeningLensV1;
  /** True while the screening output is being fetched. */
  isLoading?: boolean;
}

const CONFIDENCE_COLORS: Record<ScreeningEvidence["confidence"], string> = {
  high: "border-emerald-500/40 bg-emerald-50 text-emerald-900",
  medium: "border-amber-300/60 bg-amber-50 text-amber-900",
  low: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
};

function isHttpUrl(s: string | undefined | null): s is string {
  if (!s) return false;
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function LensEvidencePopover({
  lensLabel,
  scoreLabel,
  children,
  lens,
  isLoading,
}: LensEvidencePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-80 p-0"
        data-testid="lens-evidence-popover"
      >
        <div className="border-b px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{lensLabel}</span>
            {scoreLabel && (
              <span className="text-xs font-medium text-muted-foreground">
                {scoreLabel}
              </span>
            )}
          </div>
          {lens?.rationale && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {lens.rationale}
            </p>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading evidence…</p>
          ) : !lens || lens.evidence.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              No evidence captured for this lens
            </div>
          ) : (
            <ul className="space-y-2.5">
              {lens.evidence.map((item, idx) => {
                const url = isHttpUrl(item.source) ? item.source : null;
                const claimText = (
                  <span className="break-words text-xs leading-snug">
                    {item.claim}
                  </span>
                );
                return (
                  <li
                    key={`${item.claim}-${idx}`}
                    className="flex items-start gap-2"
                    data-testid="lens-evidence-item"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 border px-1.5 py-0 text-[10px] capitalize",
                        CONFIDENCE_COLORS[item.confidence],
                      )}
                    >
                      {item.confidence}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-1 hover:underline"
                          data-testid="lens-evidence-link"
                        >
                          {claimText}
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
                        </a>
                      ) : (
                        <>{claimText}</>
                      )}
                      {item.source && !url && (
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          source: {item.source}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
