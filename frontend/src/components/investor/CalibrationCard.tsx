// DS-E7-F3-S1 — calibration mismatch surface for the investor.
// Reads aggregate stats from /investor/calibration: how often the
// system's triage classification at decision time aligned with the
// investor's actual verdict. Closes the visible side of the loop —
// each verdict the investor records (DS-E11-F1-S1) updates these
// counts, making the platform's calibration audit-able.
//
// Hidden when the investor has fewer than MIN_DECISIONS verdicts on
// file — small samples are too noisy to surface as a stat.

import { useState } from "react";
import { useInvestorControllerGetCalibration } from "@/api/generated/investor/investor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GaugeCircle,
  AlertCircle,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  Lightbulb,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCalibrationProposals,
  useApproveCalibrationProposal,
  useRejectCalibrationProposal,
  type CalibrationProposal,
} from "@/lib/calibration/useCalibration";

interface CalibrationStats {
  totalDecisions: number;
  decisionsWithTriage: number;
  aligned: number;
  falsePositive: number;
  falseNegative: number;
  softMismatch: number;
  alignmentRate: number | null;
  topOverrideReasons: Array<{ reasonTag: string; count: number }>;
  recentMismatches: Array<{
    startupId: string;
    decidedAt: string;
    mismatchType: "false_positive" | "false_negative" | "soft_mismatch";
    modelVerdict: "advance" | "review" | "reject";
    investorVerdict: "advance" | "pass" | "hold";
    reasonTags: string[];
  }>;
}

function unwrap<T>(payload: unknown): T | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T | undefined;
}

const MIN_DECISIONS = 3;

function formatMismatchType(type: string): string {
  return type.replace(/_/g, " ");
}

function formatDecisionPath(mismatch: CalibrationStats["recentMismatches"][number]): string {
  return `${mismatch.modelVerdict} → ${mismatch.investorVerdict}`;
}

function rateLabel(rate: number | null): string {
  if (rate === null) return "no data yet";
  return `${Math.round(rate * 100)}% aligned`;
}

function rateTone(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 0.75) return "text-emerald-700";
  if (rate >= 0.5) return "text-amber-700";
  return "text-rose-700";
}

interface CalibrationCardProps {
  className?: string;
}

export function CalibrationCard({ className }: CalibrationCardProps) {
  const { data, isLoading } = useInvestorControllerGetCalibration({
    query: {
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const stats = unwrap<CalibrationStats>(data) ?? null;

  // Hide entirely while loading OR until we have meaningful sample size.
  // The proposals panel renders on the same card surface; if the parent
  // card is hidden the panel hides with it (a proposal is only ever
  // emitted after the same sample threshold is crossed by the recompute,
  // so this stays self-consistent).
  if (isLoading || !stats || stats.decisionsWithTriage < MIN_DECISIONS) {
    return null;
  }

  return (
    <Card className={className} data-testid="calibration-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GaugeCircle className="h-4 w-4" />
          Calibration
          <span className={cn("ml-auto text-xs font-normal", rateTone(stats.alignmentRate))}>
            {rateLabel(stats.alignmentRate)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          How the system's triage compared with your actual verdicts on{" "}
          {stats.decisionsWithTriage} of {stats.totalDecisions} deals.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            icon={<ThumbsUp className="h-3.5 w-3.5" />}
            label="Aligned"
            value={stats.aligned}
            tone="good"
          />
          <Stat
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="False positive"
            value={stats.falsePositive}
            tone="bad"
            hint="Model said advance, you passed"
          />
          <Stat
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            label="False negative"
            value={stats.falseNegative}
            tone="bad"
            hint="Model said reject, you advanced"
          />
          <Stat
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            label="Soft mismatch"
            value={stats.softMismatch}
            tone="warn"
            hint="Model hedged (review), you didn't"
          />
        </div>

        {stats.topOverrideReasons.length > 0 && (
          <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Top override reasons
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {stats.topOverrideReasons.map((reason) => (
                <Badge key={reason.reasonTag} variant="outline" className="gap-1 capitalize text-[10px]">
                  {reason.reasonTag}
                  <span className="text-muted-foreground">×{reason.count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {stats.recentMismatches[0] && (
          <p className="mt-3 text-xs text-muted-foreground">
            Latest mismatch: {formatDecisionPath(stats.recentMismatches[0])} · {formatMismatchType(stats.recentMismatches[0].mismatchType)}
            {stats.recentMismatches[0].reasonTags.length > 0
              ? ` (${stats.recentMismatches[0].reasonTags.join(", ")})`
              : ""}
          </p>
        )}

        <CalibrationProposalsPanel />
      </CardContent>
    </Card>
  );
}

// DS-E11-F3-S1 — proposal review surface. Surfaces the latest pending
// proposals emitted by the recompute job and lets the investor accept
// or reject them. Approve/reject are HTTP-only round-trips; the WS
// event re-invalidates the list on creation so newly emitted proposals
// appear without a refresh.
function CalibrationProposalsPanel() {
  const { data: proposals, isLoading } = useCalibrationProposals("pending");
  const approve = useApproveCalibrationProposal();
  const reject = useRejectCalibrationProposal();
  const [reasonByProposal, setReasonByProposal] = useState<
    Record<string, string>
  >({});

  if (isLoading) return null;
  const pending = proposals ?? [];
  if (pending.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-amber-300/60 bg-amber-50/50 p-3" data-testid="calibration-suggestions">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-900">
        <Lightbulb className="h-3.5 w-3.5" />
        Calibration suggestions ({pending.length})
      </div>
      <ul className="flex flex-col gap-3">
        {pending.map((proposal) => (
          <ProposalRow
            key={proposal.id}
            proposal={proposal}
            isBusy={approve.isPending || reject.isPending}
            reason={reasonByProposal[proposal.id] ?? ""}
            onReasonChange={(value) =>
              setReasonByProposal((prev) => ({ ...prev, [proposal.id]: value }))
            }
            onApprove={() => approve.mutate(proposal.id)}
            onReject={() =>
              reject.mutate({
                proposalId: proposal.id,
                reason:
                  reasonByProposal[proposal.id]?.trim() || undefined,
              })
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ProposalRow({
  proposal,
  isBusy,
  reason,
  onReasonChange,
  onApprove,
  onReject,
}: {
  proposal: CalibrationProposal;
  isBusy: boolean;
  reason: string;
  onReasonChange: (next: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { suggestedDelta, evidence } = proposal;
  return (
    <li className="rounded-md border bg-white/60 p-3 text-xs" data-testid={`calibration-proposal-${proposal.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {suggestedDelta.lensAdjustments.length > 0 && (
            <p className="font-medium text-foreground">
              Lens nudges:&nbsp;
              {suggestedDelta.lensAdjustments
                .map((a) => `${a.lensKey} ${a.adjustment > 0 ? "+" : ""}${a.adjustment}`)
                .join(", ")}
            </p>
          )}
          {suggestedDelta.overrideTagFocus.length > 0 && (
            <p className="mt-1 text-muted-foreground">
              Focus reasons:&nbsp;
              {suggestedDelta.overrideTagFocus.map((tag) => (
                <Badge key={tag} variant="outline" className="ml-1 capitalize text-[10px]">
                  {tag}
                </Badge>
              ))}
            </p>
          )}
          {evidence.lensDeltaSummary.length > 0 && (
            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              Evidence: {evidence.lensDeltaSummary.length} lens delta{evidence.lensDeltaSummary.length === 1 ? "" : "s"} · {evidence.topOverrideReasons.length} override reason{evidence.topOverrideReasons.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={isBusy}
            onClick={onApprove}
            data-testid={`approve-${proposal.id}`}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={onReject}
            data-testid={`reject-${proposal.id}`}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      </div>
      <input
        type="text"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
        placeholder="Optional: why are you rejecting?"
        className="mt-2 w-full rounded border bg-white px-2 py-1 text-[11px]"
        data-testid={`reject-reason-${proposal.id}`}
      />
    </li>
  );
}

const TONE_CLASSES: Record<"good" | "bad" | "warn", string> = {
  good: "border-emerald-300/60 bg-emerald-50 text-emerald-900",
  bad: "border-rose-300/60 bg-rose-50 text-rose-900",
  warn: "border-amber-300/60 bg-amber-50 text-amber-900",
};

function Stat({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "good" | "bad" | "warn";
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-md border px-2.5 py-2",
        TONE_CLASSES[tone],
      )}
      title={hint}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
