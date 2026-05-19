// DS-E4-F4-S1 — deterministic dealbreaker narrative parser (backend source of truth).

const SEPARATOR_RE = /[,;\n•·•‣◦⁃]+|\s+\/\s+|\s+\|\s+/;

const STOP_WORDS = new Set([
  "no",
  "not",
  "anti",
  "any",
  "the",
  "and",
  "or",
  "etc",
  "etc.",
  "we",
  "i",
  "do",
  "don't",
  "dont",
  "avoid",
  "exclude",
  "excluded",
  "skip",
  "skipping",
  "passing",
  "pass",
  "stay",
  "away",
  "from",
  "against",
  "won't",
  "wont",
  "never",
  "without",
  "anything",
  "businesses",
  "business",
  "companies",
  "company",
  "industries",
  "industry",
  "sectors",
  "sector",
  "space",
  "spaces",
  "that",
  "which",
  "with",
  "have",
  "has",
  "had",
  "are",
  "is",
  "was",
  "were",
  "be",
  "been",
  "being",
  "all",
  "only",
  "just",
  "also",
  "very",
  "too",
  "our",
  "my",
]);

const MIN_TOKEN_LENGTH = 2;
const MAX_SUGGESTIONS = 12;

export function parseDealbreakerSuggestions(narrative: string): string[] {
  const trimmed = narrative.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(SEPARATOR_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const part of parts) {
    const cleaned = part
      .replace(/^[-–—*]+\s*/, "")
      .replace(/^(no|not|avoid|exclude)\s+/i, "")
      .trim();

    if (cleaned.length < MIN_TOKEN_LENGTH) continue;
    if (STOP_WORDS.has(cleaned.toLowerCase())) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_SUGGESTIONS) break;
  }

  return out;
}
