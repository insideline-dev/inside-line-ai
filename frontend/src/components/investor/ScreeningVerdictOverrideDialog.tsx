import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ScreeningVerdict } from "./screening-types";

const VERDICT_LABELS: Record<ScreeningVerdict, string> = {
  advance: "Advance",
  review: "Review",
  reject: "Reject",
};

const REASON_CODES = [
  { value: "false_positive", label: "AI false positive" },
  { value: "false_negative", label: "AI false negative" },
  { value: "new_information", label: "New information" },
  { value: "partner_judgment", label: "Partner judgment" },
  { value: "thesis_exception", label: "Thesis exception" },
];

interface ScreeningVerdictOverrideDialogProps {
  currentVerdict: ScreeningVerdict;
  disabled?: boolean;
  isSubmitting: boolean;
  onSubmit: (input: {
    targetClassification: ScreeningVerdict;
    reason: string;
    reasonCode?: string;
  }) => void;
}

export function ScreeningVerdictOverrideDialog({
  currentVerdict,
  disabled,
  isSubmitting,
  onSubmit,
}: ScreeningVerdictOverrideDialogProps) {
  const [open, setOpen] = useState(false);
  const [targetClassification, setTargetClassification] =
    useState<ScreeningVerdict>(currentVerdict === "reject" ? "review" : "reject");
  const [reasonCode, setReasonCode] = useState<string | undefined>();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const availableVerdicts = useMemo(
    () =>
      (Object.keys(VERDICT_LABELS) as ScreeningVerdict[]).filter(
        (verdict) => verdict !== currentVerdict,
      ),
    [currentVerdict],
  );
  const reasonError = touched && reason.trim().length < 3;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setTargetClassification(availableVerdicts[0] ?? "review");
      setReasonCode(undefined);
      setReason("");
      setTouched(false);
    }
  };

  const handleSubmit = () => {
    setTouched(true);
    if (reason.trim().length < 3 || targetClassification === currentVerdict) return;
    onSubmit({ targetClassification, reason: reason.trim(), reasonCode });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          Change verdict
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-balance">Change screening verdict</DialogTitle>
          <DialogDescription className="text-pretty">
            This keeps the AI verdict intact and records your override for calibration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="screening-verdict-target">New verdict</Label>
            <Select
              value={targetClassification}
              onValueChange={(value) =>
                setTargetClassification(value as ScreeningVerdict)
              }
            >
              <SelectTrigger id="screening-verdict-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableVerdicts.map((verdict) => (
                  <SelectItem key={verdict} value={verdict}>
                    {VERDICT_LABELS[verdict]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="screening-verdict-reason-code">Reason category</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="screening-verdict-reason-code">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((code) => (
                  <SelectItem key={code.value} value={code.value}>
                    {code.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="screening-verdict-reason">Reason</Label>
            <Textarea
              id="screening-verdict-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Why should this verdict change?"
              aria-invalid={reasonError}
            />
            {reasonError && (
              <p className="text-sm text-destructive">
                Add a short reason before saving the override.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
