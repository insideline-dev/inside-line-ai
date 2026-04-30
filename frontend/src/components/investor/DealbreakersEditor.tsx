// DS-E4-F4-S1 — investor authors structured dealbreaker rules.
//
// Tag-list editor: type a tag + Enter to add, click X to remove. Pairs
// with a suggestion banner that parses the investor's anti-portfolio
// narrative and proposes candidates; one tap applies them.

import { useMemo, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Sparkles } from "lucide-react";
import {
  parseDealbreakerSuggestions,
  diffNewSuggestions,
} from "@/lib/screening/parse-dealbreakers";
import { cn } from "@/lib/utils";

interface DealbreakersEditorProps {
  /** Current structured dealbreakers. */
  value: string[];
  onChange: (next: string[]) => void;
  /**
   * Free-text narrative the investor authored about exclusions. When
   * non-empty, the editor parses it deterministically and surfaces
   * candidate tags the investor can apply with one click.
   */
  exclusionNarrative?: string;
  className?: string;
}

const MAX_DEALBREAKERS = 30;
const MAX_TAG_LENGTH = 40;

export function DealbreakersEditor({
  value,
  onChange,
  exclusionNarrative,
  className,
}: DealbreakersEditorProps) {
  const [draft, setDraft] = useState("");

  const suggestions = useMemo(
    () => parseDealbreakerSuggestions(exclusionNarrative ?? ""),
    [exclusionNarrative],
  );
  const newSuggestions = useMemo(
    () => diffNewSuggestions(suggestions, value),
    [suggestions, value],
  );

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (tag.length > MAX_TAG_LENGTH) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    if (value.length >= MAX_DEALBREAKERS) return;
    onChange([...value, tag]);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(draft);
      setDraft("");
    }
    // Comma-key add intentionally omitted — investors paste comma-separated
    // exclusion lists into the anti-portfolio textarea above; the suggestion
    // banner picks them up. Adding mid-type on comma also surprises users
    // typing things like "AI, ML" into the single-tag input.
    //
    // Empty-Backspace tag-pop intentionally omitted — silent tag deletion
    // is a known footgun. Investors remove tags via the X button.
  };

  const applyAllSuggestions = () => {
    if (newSuggestions.length === 0) return;
    onChange([...value, ...newSuggestions].slice(0, MAX_DEALBREAKERS));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Label className="text-sm font-medium">Dealbreakers</Label>
      <p className="-mt-1 text-xs text-muted-foreground">
        Hard exclusions checked against every deal. Add specific industries
        or terms; matching is word-boundary so "ai" won't hit "available".
      </p>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="dealbreakers-list">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1"
              data-testid={`dealbreaker-tag-${tag}`}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="opacity-60 hover:opacity-100"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a tag and press Enter (e.g. tobacco, weapons, B2C)…"
          maxLength={MAX_TAG_LENGTH}
          disabled={value.length >= MAX_DEALBREAKERS}
          data-testid="dealbreakers-input"
        />
        <Button
          type="button"
          variant="outline"
          size="default"
          onClick={() => {
            addTag(draft);
            setDraft("");
          }}
          disabled={!draft.trim() || value.length >= MAX_DEALBREAKERS}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {newSuggestions.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs"
          data-testid="dealbreaker-suggestions"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-700" />
          <span className="font-medium text-amber-900">
            From your anti-portfolio narrative:
          </span>
          <div className="flex flex-wrap gap-1">
            {newSuggestions.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="cursor-pointer gap-1 border-amber-400 bg-white hover:bg-amber-100"
                onClick={() => addTag(tag)}
                data-testid={`dealbreaker-suggestion-${tag}`}
              >
                <Plus className="h-3 w-3" />
                {tag}
              </Badge>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[11px] text-amber-900 hover:bg-amber-100"
            onClick={applyAllSuggestions}
          >
            Apply all
          </Button>
        </div>
      )}

      {value.length >= MAX_DEALBREAKERS && (
        <p className="text-[11px] text-muted-foreground">
          {MAX_DEALBREAKERS}-tag limit reached.
        </p>
      )}
    </div>
  );
}
