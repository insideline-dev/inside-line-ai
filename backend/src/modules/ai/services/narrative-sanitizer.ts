const SCORE_TOKEN_REGEX = /\b\d{1,3}\s*\/\s*100\b/i;
const CONFIDENCE_TOKEN_REGEX = /\bconfidence\b/i;
const SCORE_WITH_CONFIDENCE_LINE_REGEX =
  /\b\d{1,3}\s*\/\s*100\b[^\n]*\bconfidence\b/i;
const SCORE_SENTENCE_REGEX =
  /(^|[.!?]\s+)([^.!?\n]*\b\d{1,3}\s*\/\s*100\b[^.!?\n]*[.!?]?)/gim;
const CONFIDENCE_PHRASE_REGEX =
  /\s*,?\s*(?:with\s+)?(?:high|mid|medium|low|\d{1,3}%?)\s+confidence\b/gi;
const SCORE_DIMENSION_LABEL_REGEX =
  /\b(?:highest|lowest)[-\s]scor(?:ed|ing)\s+dimensions?\s+are\b[^.!?\n]*[.!?]?/gi;

function hasScoreConfidenceTokens(value: string): boolean {
  return SCORE_TOKEN_REGEX.test(value) && CONFIDENCE_TOKEN_REGEX.test(value);
}

export function sanitizeNarrativeText(input: string): string {
  let cleaned = input.replace(/\r\n/g, "\n");

  cleaned = cleaned.replace(
    /\s*\([^()\n]*\b\d{1,3}\s*\/\s*100\b[^()\n]*\bconfidence\b[^()\n]*\)/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\bthis section is currently scored at\s+\d{1,3}\s*\/\s*100(?:\s+with\s+\d{1,3}%\s+confidence)?\.?/gi,
    "",
  );
  cleaned = cleaned.replace(
    /\b[^.!?\n]{0,160}\bis currently rated\s+\d{1,3}\s*\/\s*100[^.!?\n]*\bconfidence\b[^.!?\n]*[.!?]?/gi,
    "",
  );
  cleaned = cleaned.replace(
    /(^|[.!?]\s+)([^.!?\n]*\b\d{1,3}\s*\/\s*100\b[^.!?\n]*\bconfidence\b[^.!?\n]*[.!?]?)/gim,
    "$1",
  );
  cleaned = cleaned.replace(SCORE_SENTENCE_REGEX, "$1");
  cleaned = cleaned.replace(CONFIDENCE_PHRASE_REGEX, "");
  cleaned = cleaned.replace(SCORE_DIMENSION_LABEL_REGEX, "");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const compact = line.trim();
      if (compact.length === 0) {
        return true;
      }
      return !SCORE_WITH_CONFIDENCE_LINE_REGEX.test(compact);
    });

  cleaned = lines.join("\n");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");
  cleaned = cleaned.replace(/\s+\./g, ".");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

export function reconcileCitationMarkers(
  narrative: string,
  sources: Array<{ label: string; url: string }>,
): { narrative: string; sources: Array<{ label: string; url: string }> } {
  const markerRegex = /\[(\d+)\]/g;

  // 1. Remove markers that reference out-of-bounds indices
  let cleaned = narrative.replace(markerRegex, (match, indexStr: string) => {
    const idx = parseInt(indexStr, 10);
    return idx >= 1 && idx <= sources.length ? match : "";
  });

  // 2. Collect which 1-based indices are still referenced
  const referenced = new Set<number>();
  let m: RegExpExecArray | null;
  const scanRegex = /\[(\d+)\]/g;
  while ((m = scanRegex.exec(cleaned)) !== null) {
    referenced.add(parseInt(m[1], 10));
  }

  // 3. Build new sources array keeping only referenced ones, and create old→new index map
  const indexMap = new Map<number, number>();
  const newSources: Array<{ label: string; url: string }> = [];
  for (let i = 0; i < sources.length; i++) {
    if (referenced.has(i + 1)) {
      indexMap.set(i + 1, newSources.length + 1);
      newSources.push(sources[i]);
    }
  }

  // 4. Re-index markers in the text
  cleaned = cleaned.replace(/\[(\d+)\]/g, (_, indexStr: string) => {
    const newIdx = indexMap.get(parseInt(indexStr, 10));
    return newIdx != null ? `[${newIdx}]` : "";
  });

  return { narrative: cleaned, sources: newSources };
}

export function hasScoreConfidenceLanguage(input: string): boolean {
  return hasScoreConfidenceTokens(input);
}
