// DS-E11-F1-S1 — 30-second close/pass capture form. Triggered from the
// deal card's verdict button. Investor picks Advance / Pass / Hold,
// optionally tags reasons, optionally adds a one-line note. Submission
// is the seed data for the calibration loop (DS-E7-F3-S1) — the
// triage classification at the moment of capture is included so the
// loop can later compare model verdict vs investor verdict.
//
// Designed for "30 seconds": single screen, no scroll on a typical
// laptop, default verdict pre-selected based on the system's triage,
// reason chips for one-tap tagging, optional note. ESC / Cancel
// preserves the in-flight draft until the dialog is fully closed.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type DealVerdict = "advance" | "pass" | "hold";
export type TriageClassification = "advance" | "review" | "reject";

const VERDICT_OPTIONS: ReadonlyArray<{
  value: DealVerdict;
  label: string;
  description: string;
  ringClass: string;
}> = [
  {
    value: "advance",
    label: "Advance",
    description: "Move to DD",
    ringClass:
      "data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-50 data-[active=true]:text-emerald-900",
  },
  {
    value: "hold",
    label: "Hold",
    description: "Need more info",
    ringClass:
      "data-[active=true]:border-amber-400 data-[active=true]:bg-amber-50 data-[active=true]:text-amber-900",
  },
  {
    value: "pass",
    label: "Pass",
    description: "Not a fit now",
    ringClass:
      "data-[active=true]:border-rose-500 data-[active=true]:bg-rose-50 data-[active=true]:text-rose-900",
  },
];

const REASON_TAGS: ReadonlyArray<string> = [
  "team",
  "market",
  "traction",
  "product",
  "pricing",
  "timing",
  "geography",
  "out of thesis",
];

const MAX_NOTE_CHARS = 500;

interface CloseDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupName: string;
  /** Pre-fills the verdict toggle with the system's recommended action. */
  triageClassification?: TriageClassification;
  isSubmitting: boolean;
  onSubmit: (input: {
    verdict: DealVerdict;
    reasonTags: string[];
    notes?: string;
    triageClassificationAtDecision?: TriageClassification;
  }) => void;
}

function defaultVerdictFor(
  triage?: TriageClassification,
): DealVerdict {
  switch (triage) {
    case "advance":
      return "advance";
    case "reject":
      return "pass";
    case "review":
    default:
      return "hold";
  }
}

export function CloseDealDialog({
  open,
  onOpenChange,
  startupName,
  triageClassification,
  isSubmitting,
  onSubmit,
}: CloseDealDialogProps) {
  const [verdict, setVerdict] = useState<DealVerdict>(
    defaultVerdictFor(triageClassification),
  );
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Reset draft state every time the dialog opens so a stale form from a
  // previous deal can't bleed into a new capture.
  useEffect(() => {
    if (open) {
      setVerdict(defaultVerdictFor(triageClassification));
      setTags([]);
      setNotes("");
    }
  }, [open, triageClassification]);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = () => {
    onSubmit({
      verdict,
      reasonTags: tags,
      notes: notes.trim() ? notes.trim() : undefined,
      triageClassificationAtDecision: triageClassification,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close out — {startupName}</DialogTitle>
          <DialogDescription>
            Quick capture so calibration learns from your call.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Your verdict
            </Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {VERDICT_OPTIONS.map((opt) => {
                const active = verdict === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    data-active={active}
                    onClick={() => setVerdict(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/40",
                      opt.ringClass,
                    )}
                    data-testid={`close-deal-verdict-${opt.value}`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Reason tags{" "}
              <span className="text-[10px] normal-case opacity-70">
                (optional, tap to toggle)
              </span>
            </Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REASON_TAGS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <Badge
                    key={tag}
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer select-none gap-1 capitalize"
                    onClick={() => toggleTag(tag)}
                    data-testid={`close-deal-tag-${tag.replace(/\s+/g, "-")}`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {tag}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div>
            <Label
              htmlFor="close-deal-notes"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Notes <span className="text-[10px] normal-case opacity-70">(optional)</span>
            </Label>
            <Textarea
              id="close-deal-notes"
              rows={3}
              maxLength={MAX_NOTE_CHARS}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="One line on why."
              className="mt-2"
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {MAX_NOTE_CHARS - notes.length} characters left
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            data-testid="close-deal-submit"
          >
            {isSubmitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : null}
            Save decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
