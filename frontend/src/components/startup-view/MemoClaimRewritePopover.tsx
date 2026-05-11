// DG-E1-F3-S1 — inline claim edit popover.
//
// Operator flow:
//   1. Click "Edit" on a memo section → this dialog opens with the
//      current section narrative pre-loaded into a textarea.
//   2. Operator can either save the edit verbatim, or click
//      "Suggest rewrite" → backend returns up to 3 candidate rewrites
//      that preserve the section's existing source set.
//   3. Per-rewrite "Use" replaces the textarea content; "Copy" copies it.
//   4. "Save" persists through the section-regeneration JSON-merge path
//      via `useApplyClaimRewrite` (DG-E1-F1-S2 reuse — preserves other
//      sections, executive summary, and the section's existing sources).
//
// Citation linkage is preserved by default: the apply call carries no
// `sources` override, so the backend keeps the section's existing
// sources untouched. The Suggest endpoint's prompt + a server-side
// factual-marker guard prevent the AI from inventing new citations.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useApplyClaimRewrite,
  useSuggestClaimRewrite,
  type ClaimRewriteCandidate,
} from "@/lib/memo/useClaimRewrite";
import type { MemoSectionKey } from "@/lib/memo/useRegenerateMemoSection";

interface MemoSectionSource {
  label: string;
  url: string;
}

export interface MemoClaimRewritePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startupId: string;
  sectionKey: MemoSectionKey;
  sectionTitle: string;
  initialText: string;
  sources?: MemoSectionSource[];
  /** Triggers when a save successfully persists. */
  onApplied?: () => void;
}

export function MemoClaimRewritePopover({
  open,
  onOpenChange,
  startupId,
  sectionKey,
  sectionTitle,
  initialText,
  sources,
  onApplied,
}: MemoClaimRewritePopoverProps) {
  const [draft, setDraft] = useState(initialText);
  const [instruction, setInstruction] = useState("");
  const [rewrites, setRewrites] = useState<ClaimRewriteCandidate[]>([]);
  const [suggestFallback, setSuggestFallback] = useState(false);
  const [suggestNotice, setSuggestNotice] = useState<string | null>(null);

  // Reset internal state whenever the dialog is reopened with a fresh
  // section. The parent owns the `open` flag — we just sync our drafts.
  useEffect(() => {
    if (open) {
      setDraft(initialText);
      setInstruction("");
      setRewrites([]);
      setSuggestFallback(false);
      setSuggestNotice(null);
    }
  }, [open, initialText]);

  const suggestMutation = useSuggestClaimRewrite(startupId);
  const applyMutation = useApplyClaimRewrite(startupId);

  const handleSuggest = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      toast.error("Nothing to rewrite", {
        description: "Edit the section text first, then ask for a suggestion.",
      });
      return;
    }

    const sourceIds = (sources ?? [])
      .map((s) => (s.url && s.url.trim().length > 0 ? s.url : s.label))
      .filter((s) => s.length > 0);

    suggestMutation.mutate(
      {
        sectionKey,
        originalText: trimmed,
        instruction: instruction.trim() || undefined,
        sourceIds: sourceIds.length > 0 ? sourceIds : undefined,
      },
      {
        onSuccess: (result) => {
          setRewrites(result.rewrites);
          setSuggestFallback(result.usedFallback);
          if (result.rewrites.length === 0) {
            setSuggestNotice(
              result.candidateCountBeforeFilter === 0
                ? "The model returned no rewrites. Try a different instruction."
                : `All ${result.candidateCountBeforeFilter} candidates introduced new facts not present in your edit. Tighten the instruction and try again.`,
            );
          } else {
            setSuggestNotice(null);
          }
        },
        onError: (error) => {
          toast.error("Failed to fetch rewrite suggestions", {
            description:
              error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  }, [draft, instruction, sectionKey, sources, suggestMutation]);

  const handleUseRewrite = useCallback((candidate: ClaimRewriteCandidate) => {
    setDraft(candidate.text);
  }, []);

  const handleCopy = useCallback(async (candidate: ClaimRewriteCandidate) => {
    try {
      await navigator.clipboard.writeText(candidate.text);
      toast.success("Rewrite copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      toast.error("Section content cannot be empty");
      return;
    }
    applyMutation.mutate(
      {
        sectionKey,
        newContent: trimmed,
        // Intentionally omit `sources` — the backend keeps the existing
        // section sources unchanged when no override is supplied. This is
        // the load-bearing source-preservation invariant for DG-E1-F3-S1.
      },
      {
        onSuccess: () => {
          toast.success(`Saved edits to the ${sectionTitle} section.`);
          onApplied?.();
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("Failed to save section edits", {
            description:
              error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  }, [applyMutation, draft, onApplied, onOpenChange, sectionKey, sectionTitle]);

  const isDirty = draft.trim() !== initialText.trim();
  const isSaving = applyMutation.isPending;
  const isSuggesting = suggestMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        data-testid={`dialog-memo-claim-rewrite-${sectionKey}`}
      >
        <DialogHeader>
          <DialogTitle>Edit {sectionTitle}</DialogTitle>
          <DialogDescription>
            Tighten the narrative or ask AI for a polished rewrite. Citations
            stay linked to the section's existing sources.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[180px] text-sm"
            data-testid={`input-memo-claim-rewrite-draft-${sectionKey}`}
            aria-label={`${sectionTitle} draft`}
          />

          <div className="space-y-2">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`memo-rewrite-instruction-${sectionKey}`}
            >
              Optional instruction for the AI rewrite
            </label>
            <Input
              id={`memo-rewrite-instruction-${sectionKey}`}
              placeholder="e.g. shorter · more cautious · less hedging"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              data-testid={`input-memo-claim-rewrite-instruction-${sectionKey}`}
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Returns up to 3 candidates. Rewrites that introduce new facts
                are dropped server-side.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSuggest}
                disabled={isSuggesting}
                data-testid={`button-memo-claim-rewrite-suggest-${sectionKey}`}
              >
                {isSuggesting ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Suggesting…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    Suggest rewrite
                  </>
                )}
              </Button>
            </div>
          </div>

          {suggestFallback && (
            <div
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
              data-testid={`memo-claim-rewrite-fallback-${sectionKey}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                The model didn't return rewrites — try refining the instruction.
              </span>
            </div>
          )}

          {suggestNotice && (
            <p
              className="text-xs text-muted-foreground"
              data-testid={`memo-claim-rewrite-notice-${sectionKey}`}
            >
              {suggestNotice}
            </p>
          )}

          {rewrites.length > 0 && (
            <div
              className="space-y-2"
              data-testid={`memo-claim-rewrite-candidates-${sectionKey}`}
            >
              <p className="text-xs font-medium text-muted-foreground">
                Suggested rewrites
              </p>
              {rewrites.map((candidate, idx) => (
                <div
                  key={idx}
                  className="rounded-md border bg-muted/20 p-2 text-sm"
                  data-testid={`memo-claim-rewrite-candidate-${sectionKey}-${idx}`}
                >
                  <p className="leading-relaxed">{candidate.text}</p>
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleCopy(candidate)}
                      data-testid={`button-memo-claim-rewrite-copy-${sectionKey}-${idx}`}
                    >
                      <ClipboardCopy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleUseRewrite(candidate)}
                      data-testid={`button-memo-claim-rewrite-use-${sectionKey}-${idx}`}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Use
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            data-testid={`button-memo-claim-rewrite-cancel-${sectionKey}`}
          >
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            data-testid={`button-memo-claim-rewrite-save-${sectionKey}`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="w-3 h-3 mr-1" />
                Save edit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
