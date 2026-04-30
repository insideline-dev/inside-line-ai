import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, AlertCircle, CheckCheck } from "lucide-react";
import {
  useStartupControllerFindOne,
  useStartupControllerFindApprovedById,
} from "@/api/generated/startups/startups";
import {
  useTriageDecision,
  type TriageDecision,
  type TriageLensSnapshot,
} from "@/lib/screening/useTriageDecision";
import { ClassificationBadge } from "./ClassificationBadge";
import { summarizeReasonCodes } from "@/lib/screening/reason-codes";
import {
  evaluateDealbreakers,
  hasHardViolation,
} from "@/lib/screening/thesis-rules";
import { useInvestorControllerGetThesis } from "@/api/generated/investor/investor";
import type { InvestmentThesis } from "@/types/investor";
import type { Startup } from "@/types/startup";
import { cn } from "@/lib/utils";

interface DealCardProps {
  startupId: string;
  className?: string;
  /** Optional pre-fetched startup to avoid duplicate requests on detail pages. */
  startup?: Startup;
}

const LENS_LABELS: Record<string, string> = {
  market: "Market",
  team: "Team",
  traction: "Traction",
  product: "Product",
  gtm: "GTM",
  financials: "Financials",
};

// Default placeholder ordering for the "no decision yet" empty state. Once a
// decision exists, we render whatever lenses came back from the backend in
// their backend-supplied order — keeps the UI in lockstep with the lens
// registry without code changes when the registry adds/swaps lenses.
const PLACEHOLDER_LENS_KEYS = ["market", "team", "traction"] as const;

function lensLabel(key: string): string {
  return LENS_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function unwrap<T>(payload: unknown): T | undefined {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T | undefined;
}

function formatStage(stage?: string | null): string | null {
  if (!stage) return null;
  return stage.replace(/_/g, " ");
}

type LensTile =
  | { key: string; lens: TriageLensSnapshot }
  | { key: string; lens: undefined };

function buildLensTiles(decision: TriageDecision | null | undefined): LensTile[] {
  if (decision && decision.lensSnapshot.length > 0) {
    return decision.lensSnapshot.map((lens) => ({ key: lens.key, lens }));
  }
  return PLACEHOLDER_LENS_KEYS.map((key) => ({ key, lens: undefined }));
}

export function DealCard({ startupId, className, startup: startupProp }: DealCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch startup only when not supplied. We try the private endpoint first,
  // then fall back to the approved one — same pattern the investor detail
  // route uses.
  const ownStartupRes = useStartupControllerFindOne(startupId, {
    query: { retry: false, enabled: !startupProp },
  });
  const approvedStartupRes = useStartupControllerFindApprovedById(startupId, {
    query: { retry: false, enabled: !startupProp && !ownStartupRes.data },
  });

  const startup =
    startupProp ??
    unwrap<Startup>(ownStartupRes.data) ??
    unwrap<Startup>(approvedStartupRes.data);

  const triage = useTriageDecision(startupId);
  const decision: TriageDecision | null | undefined = triage.data;

  // DS-E4-F3-S1 — deterministic dealbreaker check against the current
  // investor's thesis. Cheap, runs client-side, no LLM round-trip.
  // 404s if no thesis exists yet (fresh investor) — degrades to no
  // violations rather than blocking the card. Disabled until the startup
  // resolves so we don't 404-spam from non-investor render paths.
  const thesisRes = useInvestorControllerGetThesis({
    query: {
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      enabled: !!startupId,
    },
  });
  const thesis = unwrap<InvestmentThesis>(thesisRes.data) ?? null;

  const isLoading =
    !startupProp && (ownStartupRes.isLoading || approvedStartupRes.isLoading);

  if (isLoading) {
    return <DealCardSkeleton className={className} />;
  }

  if (!startup) {
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Startup unavailable
        </CardContent>
      </Card>
    );
  }

  const stage = formatStage(startup.stage);
  const sector = startup.sectorIndustryGroup ?? startup.industry ?? null;
  const lensTiles = buildLensTiles(decision);
  const dealbreakers = evaluateDealbreakers(startup, thesis);
  const hasHardDealbreaker = hasHardViolation(dealbreakers);
  const why =
    decision && decision.reasonCodes.length > 0
      ? summarizeReasonCodes(decision.reasonCodes)
      : decision
        ? "No flags raised"
        : null;

  const handleOpenMemo = () => {
    void navigate({ to: "/investor/startup/$id", params: { id: startupId } });
  };

  const handleMarkReviewed = () => {
    // TODO(DS-E7-F4): wire to PATCH /screening/:startupId/decision { reviewed: true }
    // (or the future investor-pipeline review-ack endpoint). For now this is a
    // no-op + optimistic toast so the action is discoverable in the UI.
    toast.success("Marked as reviewed");
  };

  return (
    <Card
      className={cn("overflow-hidden", className)}
      data-testid="deal-card"
    >
      <CardContent className="flex flex-col gap-4 p-5">
        {/* Header: identity + classification */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar className="h-12 w-12 shrink-0 rounded-lg border bg-muted/40">
              {startup.logoUrl ? (
                <AvatarImage
                  src={startup.logoUrl}
                  alt={startup.name}
                  className="object-contain"
                />
              ) : null}
              <AvatarFallback className="rounded-lg text-base font-semibold">
                {startup.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3
                className="truncate text-lg font-semibold leading-tight"
                data-testid="deal-card-name"
              >
                {startup.name}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {sector && (
                  <Badge variant="secondary" className="capitalize text-[11px]">
                    {sector}
                  </Badge>
                )}
                {stage && (
                  <Badge variant="outline" className="capitalize text-[11px]">
                    {stage}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            {decision ? (
              <ClassificationBadge classification={decision.classification} />
            ) : triage.isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <Badge variant="outline" className="text-[11px] text-muted-foreground">
                Not screened
              </Badge>
            )}
          </div>
        </div>

        {/* Lens scores — driven by decision.lensSnapshot when present so we
            stay in sync with the backend lens registry without code changes. */}
        <TooltipProvider delayDuration={150}>
          <div
            className="grid gap-2 rounded-lg border bg-muted/20 p-3"
            style={{ gridTemplateColumns: `repeat(${Math.max(lensTiles.length, 1)}, minmax(0, 1fr))` }}
          >
            {lensTiles.map(({ key, lens }) => {
              const label = lensLabel(key);
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex flex-col items-center gap-1 rounded-md p-1 transition-colors hover:bg-muted/40"
                      data-testid={`deal-card-lens-${key}`}
                    >
                      {lens ? (
                        <ScoreRing
                          score={lens.score}
                          size="sm"
                          showLabel={false}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 text-[10px] text-muted-foreground">
                          —
                        </div>
                      )}
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {label}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {lens?.rationale ||
                      (lens
                        ? `${label}: ${lens.signal}`
                        : decision
                          ? `${label}: no signal in this run`
                          : "No screening data yet — run the pipeline to populate")}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Dealbreakers — DS-E4-F3-S1. Deterministic per-investor checks
            against thesis fields. Hard violations show first as a clear
            "doesn't match your thesis" surface; soft ones below. */}
        {dealbreakers.length > 0 && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs",
              hasHardDealbreaker
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-amber-300/60 bg-amber-50 text-amber-900",
            )}
            data-testid="deal-card-dealbreakers"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">
              {hasHardDealbreaker
                ? "Doesn't match your thesis"
                : "Thesis-fit notes"}
            </span>
            <span className="text-[11px] opacity-90">
              {dealbreakers
                .map((v) => (v.detail ? `${v.label} (${v.detail})` : v.label))
                .join(" • ")}
            </span>
          </div>
        )}

        {/* Why line — suppressed when a hard dealbreaker fires (the
            dealbreaker IS the user-facing reason; stacking three error-
            toned rows is visual noise). */}
        {why && !hasHardDealbreaker && (
          <p
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
            data-testid="deal-card-why"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{why}</span>
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkReviewed}
            data-testid="deal-card-mark-reviewed"
          >
            <CheckCheck className="mr-1.5 h-4 w-4" />
            Mark reviewed
          </Button>
          <Button
            size="sm"
            onClick={handleOpenMemo}
            data-testid="deal-card-open-memo"
          >
            Open full memo
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DealCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} data-testid="deal-card-skeleton">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-20 w-full" />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}
