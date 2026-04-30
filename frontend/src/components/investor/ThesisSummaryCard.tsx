// DS-E3-F1-S3 — editable thesis summary that survives auto-regeneration.
// Inline edit pattern: read-only paragraph by default, Edit button toggles
// to a textarea with Save / Cancel. On Save we send only `thesisSummary`
// in the upsert payload; the backend marks the row as manually edited so
// subsequent thesis saves don't overwrite the investor's text.
//
// "Regenerate from structured params" stays on the card — clicking it
// resets the manual-edit flag and replaces the text with the deterministic
// composer output. Useful when the structured fields drift far from what
// the manual narrative says.

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2, Pencil, RefreshCw, Save, X } from "lucide-react";

interface ThesisShape {
  thesisSummary?: unknown;
  thesisSummaryGeneratedAt?: unknown;
  thesisSummaryManuallyEdited?: unknown;
}

interface ThesisSummaryCardProps {
  thesis: ThesisShape;
  isGenerating: boolean;
  isSaving: boolean;
  onRegenerate: () => void;
  onSaveEdit: (edited: string) => void;
}

const MAX_SUMMARY_CHARS = 2000;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function formatStamp(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return new Date(v).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ThesisSummaryCard({
  thesis,
  isGenerating,
  isSaving,
  onRegenerate,
  onSaveEdit,
}: ThesisSummaryCardProps) {
  const persisted = asString(thesis.thesisSummary);
  const manuallyEdited = thesis.thesisSummaryManuallyEdited === true;
  const stamp = formatStamp(thesis.thesisSummaryGeneratedAt);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(persisted);

  // Keep the draft in sync with persisted text when switching out of edit
  // mode, so a Cancel followed by another Edit shows the latest server text.
  useEffect(() => {
    if (!isEditing) setDraft(persisted);
  }, [persisted, isEditing]);

  const remaining = MAX_SUMMARY_CHARS - draft.length;
  const dirty = draft !== persisted;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Thesis Summary
              {manuallyEdited && (
                <Badge variant="secondary" className="text-[10px]">
                  Edited by you
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {stamp
                ? manuallyEdited
                  ? `Saved ${stamp}. Auto-regen paused while your edits stand.`
                  : `Last generated ${stamp}`
                : "Generate a readable summary of your investment thesis"}
            </CardDescription>
          </div>
          {!isEditing && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onRegenerate}
                disabled={isGenerating || isSaving}
                title="Replace with a fresh summary derived from your structured fields"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {persisted ? "Regenerate" : "Generate Summary"}
              </Button>
              {persisted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => setIsEditing(true)}
                  disabled={isGenerating || isSaving}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      {(persisted || isEditing) && (
        <CardContent className="space-y-2">
          {isEditing ? (
            <>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_SUMMARY_CHARS}
                rows={6}
                placeholder="Write your investment thesis in plain language…"
                data-testid="thesis-summary-textarea"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {remaining} characters left
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft(persisted);
                      setIsEditing(false);
                    }}
                    disabled={isSaving}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onSaveEdit(draft);
                      setIsEditing(false);
                    }}
                    disabled={!dirty || isSaving || draft.trim().length === 0}
                  >
                    {isSaving ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {persisted}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
