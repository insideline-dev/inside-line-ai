import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
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

const REASON_CODES = [
  { value: "strong_thesis_fit", label: "Strong thesis fit" },
  { value: "partner_conviction", label: "Partner conviction" },
  { value: "strategic_value", label: "Strategic value" },
  { value: "market_timing", label: "Market timing" },
  { value: "team_strength", label: "Exceptional team" },
  { value: "ai_underscored", label: "AI underscored potential" },
];

export interface AdvanceInput {
  reasonTags: string[];
  notes: string;
}

interface ScreeningAdvanceDialogProps {
  disabled?: boolean;
  isSubmitting: boolean;
  onSubmit: (input: AdvanceInput) => void;
  // Controlled mode — when provided, the dialog is controlled externally
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ScreeningAdvanceDialog({
  disabled,
  isSubmitting,
  onSubmit,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ScreeningAdvanceDialogProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const open = isControlled ? controlledOpen : internalOpen;

  const notesError = touched && notes.trim().length < 3;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (isControlled) {
      controlledOnOpenChange?.(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
    if (nextOpen) {
      setReasonCode(undefined);
      setNotes("");
      setTouched(false);
    }
  };

  const handleSubmit = () => {
    setTouched(true);
    if (notes.trim().length < 3) return;
    const reasonTags = reasonCode ? [reasonCode] : [];
    onSubmit({ reasonTags, notes: notes.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={disabled}
            data-testid="screening-page-advance"
          >
            <Check className="mr-1 h-4 w-4" />
            Advance to DD
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Advance to Due Diligence</DialogTitle>
          <DialogDescription className="text-pretty">
            Record why you're advancing this deal — this feeds back into
            screening calibration so the AI improves over time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="advance-reason-code">Reason category</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="advance-reason-code">
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
            <Label htmlFor="advance-notes">Notes</Label>
            <Textarea
              id="advance-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Why are you advancing this deal?"
              aria-invalid={notesError}
            />
            {notesError && (
              <p className="text-sm text-destructive">
                Add a short reason before advancing.
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
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
