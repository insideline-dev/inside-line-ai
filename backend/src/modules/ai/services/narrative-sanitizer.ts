const SCORE_TOKEN_REGEX = /\b\d{1,3}\s*\/\s*100\b/i;
const CONFIDENCE_TOKEN_REGEX = /\bconfidence\b/i;
const SCORE_WITH_CONFIDENCE_LINE_REGEX =
  /\b\d{1,3}\s*\/\s*100\b[^\n]*\bconfidence\b/i;

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

export function hasScoreConfidenceLanguage(input: string): boolean {
  return hasScoreConfidenceTokens(input);
}

