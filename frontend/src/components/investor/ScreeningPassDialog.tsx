import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

const PASS_REASON_CODES = [
  { value: "weak_thesis_fit", label: "Weak thesis fit" },
  { value: "market_concerns", label: "Market concerns" },
  { value: "team_concerns", label: "Team concerns" },
  { value: "traction_insufficient", label: "Insufficient traction" },
  { value: "timing_wrong", label: "Wrong timing" },
  { value: "competitive_landscape", label: "Competitive landscape" },
];

export interface PassInput {
  reasonTags: string[];
  notes: string;
}

interface ScreeningPassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  onSubmit: (input: PassInput) => void;
}

export function ScreeningPassDialog({
  open,
  onOpenChange,
  isSubmitting,
  onSubmit,
}: ScreeningPassDialogProps) {
  const [reasonCode, setReasonCode] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  const notesError = touched && notes.trim().length < 3;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    onOpenChange(nextOpen);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pass on this deal</DialogTitle>
          <DialogDescription className="text-pretty">
            Record why you're passing — this feeds back into screening
            calibration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pass-reason-code">Reason category</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger id="pass-reason-code">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {PASS_REASON_CODES.map((code) => (
                  <SelectItem key={code.value} value={code.value}>
                    {code.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pass-notes">Notes</Label>
            <Textarea
              id="pass-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Why are you passing on this deal?"
              aria-invalid={notesError}
            />
            {notesError && (
              <p className="text-sm text-destructive">
                Add a short reason before passing.
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
            variant="destructive"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <X className="mr-1 h-4 w-4" />
            )}
            Pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
