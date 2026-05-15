import { useMemo } from "react";
import { CheckCircle2, AlertCircle, XCircle, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FitChips } from "./FitChips";
import type { FitStatus, ThesisFitOutput } from "@/types/thesis-fit";

export type ScreeningVerdict = "review" | "advance" | "reject";

export interface LensScore {
  key: "market" | "team" | "traction";
  label: string;
  score: number; // 0-100
  note?: string;
}

export interface ScreeningDetail {
  id: string;
  companyName: string;
  industry?: string | null;
  verdict: ScreeningVerdict;
  fit: ThesisFitOutput | null;
  lensScores: LensScore[];
  triageRationale: string;
}

interface ScreeningDetailModalProps {
  detail: ScreeningDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPass?: (id: string) => void;
  onAdvance?: (id: string) => void;
}

const STATUS_ICON: Record<FitStatus, React.ElementType> = {
  match: CheckCircle2,
  borderline: AlertCircle,
  mismatch: XCircle,
};

const STATUS_COLOR: Record<FitStatus, string> = {
  match: "text-emerald-600",
  borderline: "text-amber-600",
  mismatch: "text-red-600",
};

function FitTable({ fit }: { fit: ThesisFitOutput }) {
  const rows = useMemo(
    () =>
      (
        [
          ["geography", "Geography"],
          ["stage", "Stage"],
          ["sector", "Sector"],
          ["checkSize", "Check size"],
        ] as const
      ).map(([key, label]) => ({
        key,
        label,
        axis: fit[key],
      })),
    [fit],
  );

  return (
    <div className="rounded-md border border-border">
      {rows.map(({ key, label, axis }) => {
        const Icon = STATUS_ICON[axis.status];
        return (
          <div
            key={key}
            className="flex items-start gap-3 border-b border-border px-3 py-2 last:border-b-0"
          >
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_COLOR[axis.status]}`}
            />
            <div className="flex-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{label}</span>
                <span
                  className={`text-xs uppercase ${STATUS_COLOR[axis.status]}`}
                >
                  {axis.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{axis.note}</div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-0.5 bg-muted/40 px-3 py-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">Overall fit</span>
          <span className="font-semibold">{fit.overall} / 100</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Early signal — assesses thesis alignment from the submitted info.
          May revise once a deck and team data are received.
        </span>
      </div>
    </div>
  );
}

function LensRow({ lens }: { lens: LensScore }) {
  const tone =
    lens.score >= 70
      ? "text-emerald-700"
      : lens.score >= 45
        ? "text-amber-700"
        : "text-red-700";
  return (
    <div className="flex items-baseline justify-between rounded-md border border-border px-3 py-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{lens.label}</span>
        {lens.note && (
          <span className="text-xs text-muted-foreground">{lens.note}</span>
        )}
      </div>
      <span className={`text-base font-semibold ${tone}`}>{lens.score}</span>
    </div>
  );
}

export function ScreeningDetailModal({
  detail,
  open,
  onOpenChange,
  onPass,
  onAdvance,
}: ScreeningDetailModalProps) {
  if (!detail) return null;
  const canAct = detail.verdict === "review";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            {detail.companyName}
            <Badge variant="outline" className="uppercase">
              {detail.verdict}
            </Badge>
          </DialogTitle>
          {detail.industry && (
            <DialogDescription>{detail.industry}</DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          {/* Prominent AI thesis-fit summary — this is the screening verdict
              in narrative form. Promoted above the per-axis breakdown so the
              investor reads the conclusion before scanning chips. */}
          {detail.fit?.rationale && (
            <section
              className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] p-4"
              data-testid="screening-thesis-summary"
            >
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Thesis fit summary
              </h3>
              <p className="text-sm leading-relaxed text-foreground">
                {detail.fit.rationale}
              </p>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Thesis fit — per-axis
            </h3>
            {detail.fit ? (
              <>
                <FitChips fit={detail.fit} />
                <FitTable fit={detail.fit} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Fit assessment pending.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Lens scores
            </h3>
            <div className="flex flex-col gap-1.5">
              {detail.lensScores.map((lens) => (
                <LensRow key={lens.key} lens={lens} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Triage rationale
            </h3>
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              {detail.triageRationale}
            </p>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          {canAct ? (
            <>
              <Button
                variant="outline"
                onClick={() => onPass?.(detail.id)}
                data-testid="screening-modal-pass"
              >
                Pass
              </Button>
              <Button
                onClick={() => onAdvance?.(detail.id)}
                data-testid="screening-modal-advance"
              >
                Advance to DD
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
