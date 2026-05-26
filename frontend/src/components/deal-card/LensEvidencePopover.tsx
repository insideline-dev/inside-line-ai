import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertCircle } from "lucide-react";
import { CitedText } from "@/components/CitedText";
import type {
  ScreeningEvidence,
  ScreeningLensV1,
} from "@/lib/screening/useScreeningOutput";

interface LensEvidencePopoverProps {
  lensLabel: string;
  scoreLabel: string | null;
  children: React.ReactNode;
  lens?: ScreeningLensV1;
  isLoading?: boolean;
}

function evidenceToSources(
  evidence: ScreeningEvidence[],
): Array<{ label: string; url: string }> {
  return evidence.map((e) => {
    const label =
      e.sourceType === "deck_page" && e.pageNumber
        ? `Pitch deck · page ${e.pageNumber}`
        : e.sourceLabel ?? e.source ?? e.claim.slice(0, 60);
    const url = e.url ?? "";
    return { label, url };
  });
}

export function LensEvidencePopover({
  lensLabel,
  scoreLabel,
  children,
  lens,
  isLoading,
}: LensEvidencePopoverProps) {
  const sources = lens ? evidenceToSources(lens.evidence) : [];

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-96 p-0"
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
        </div>

        <div className="max-h-80 overflow-y-auto p-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : !lens?.rationale ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" />
              No analysis captured for this lens
            </div>
          ) : (
            <CitedText
              text={lens.rationale}
              sources={sources}
              className="text-xs leading-relaxed text-muted-foreground"
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
