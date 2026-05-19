// DS-E4-F4-S1 — investor authors structured dealbreaker rules.
//
// Tag-list editor: type a tag + Enter to add, click X to remove. Pairs
// with a suggestion banner that parses the investor's anti-portfolio
// narrative and proposes candidates; one tap applies them.

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { customFetch } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Plus, X, Sparkles } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

type DealbreakerHistoryVersion = {
  versionNumber: number;
  rules: string[];
  createdAt: string;
};

export function DealbreakersEditor({
  value,
  onChange,
  exclusionNarrative,
  className,
}: DealbreakersEditorProps) {
  const [draft, setDraft] = useState("");

  const parseMutation = useMutation({
    mutationFn: async (narrative: string) =>
      customFetch<{ suggestions: string[] }>("/investor/thesis/parse-dealbreakers", {
        method: "POST",
        body: JSON.stringify({ narrative }),
      }),
  });

  const historyQuery = useQuery({
    queryKey: ["investor", "thesis", "dealbreaker-history"],
    queryFn: () =>
      customFetch<DealbreakerHistoryVersion[]>("/investor/thesis/dealbreaker-history"),
    staleTime: 30_000,
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  const historyVersions = useMemo(() => {
    const payload = historyQuery.data;
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (
      typeof payload === "object" &&
      "data" in payload &&
      Array.isArray((payload as { data: unknown }).data)
    ) {
      return (payload as { data: DealbreakerHistoryVersion[] }).data;
    }
    return [];
  }, [historyQuery.data]);

  const deterministicSuggestions = useMemo(
    () => parseDealbreakerSuggestions(exclusionNarrative ?? ""),
    [exclusionNarrative],
  );

  const llmSuggestions = parseMutation.data?.suggestions ?? null;
  const suggestions = llmSuggestions ?? deterministicSuggestions;

  useEffect(() => {
    const narrative = exclusionNarrative?.trim() ?? "";
    if (narrative.length < 12) return;
    const timer = setTimeout(() => {
      parseMutation.mutate(narrative);
    }, 400);
    return () => clearTimeout(timer);
  }, [exclusionNarrative]);
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

      {historyVersions.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`}
            />
            Change history ({historyVersions.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {historyVersions.map((version) => (
              <div
                key={version.versionNumber}
                className="rounded-md border bg-muted/30 px-3 py-2 text-xs"
              >
                <p className="font-medium text-foreground">
                  v{version.versionNumber}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {format(new Date(version.createdAt), "MMM d, yyyy HH:mm")}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">
                  {version.rules.length > 0 ? version.rules.join(" · ") : "—"}
                </p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
