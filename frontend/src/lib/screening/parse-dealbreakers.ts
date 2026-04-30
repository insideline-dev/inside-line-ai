// DS-E4-F4-S1 — extract structured dealbreaker rule suggestions from
// free-text exclusion narrative (`antiPortfolio`, `notes`).
//
// Deterministic, no LLM. Pattern: investors typically write
// "no SaaS, Vertical AI, Nuclear, F&B, Non Tech" in their anti-portfolio
// section. Splitting on common separators + filtering noise words covers
// 90% of real cases. An LLM-driven smart parse can come later if needed.
//
// Returns CANDIDATE strings the investor can confirm — never auto-applied.

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
]);

const MIN_TAG_LENGTH = 2;
const MAX_TAG_LENGTH = 40;
const MAX_SUGGESTIONS = 12;
/** Tags with more words than this are almost never real category names. */
const MAX_TAG_WORDS = 4;
/** Leading words that signal "the rest is the real exclusion". */
const LEADING_VERB_PREFIXES = new Set([
  "no",
  "not",
  "never",
  "avoid",
  "exclude",
  "skip",
]);

function stripLeadingVerbs(input: string): string {
  let out = input.trim();
  // Loop because investors write things like "no, not crypto" — strip
  // multiple leading verb prefixes one at a time.
  for (let i = 0; i < 3; i++) {
    const m = out.match(/^([A-Za-z']+)\s+(.+)$/);
    if (!m) break;
    if (LEADING_VERB_PREFIXES.has(m[1].toLowerCase())) {
      out = m[2].trim();
    } else {
      break;
    }
  }
  return out;
}

function normalizeTag(raw: string): string | null {
  const stripped = stripLeadingVerbs(raw);
  const trimmed = stripped.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.&/+-]+$/g, "");
  if (trimmed.length < MIN_TAG_LENGTH || trimmed.length > MAX_TAG_LENGTH) {
    return null;
  }
  // Real category names are short. Filter "We avoid companies with sub-par
  // unit economics" or other long sentences before they land as tags.
  if (trimmed.split(/\s+/).length > MAX_TAG_WORDS) {
    return null;
  }
  // Keep originally-capitalized terms as-is (e.g. "B2B SaaS", "F&B");
  // lowercase plain English to dedupe stop words consistently.
  const looksLikeIdentifier = /[A-Z]/.test(trimmed) || /[&/+-]/.test(trimmed);
  return looksLikeIdentifier ? trimmed : trimmed.toLowerCase();
}

/**
 * Parse a free-text exclusion narrative into candidate dealbreaker tags.
 * Returns an ordered, deduped list. Order = first-seen order in the input
 * so the investor sees suggestions in the order they wrote them.
 */
export function parseDealbreakerSuggestions(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const tokens = text.split(SEPARATOR_RE);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const tag = normalizeTag(token);
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;
    // Skip tokens that are entirely numeric or whitespace
    if (/^[\d\s]+$/.test(tag)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(tag);
    if (out.length >= MAX_SUGGESTIONS) break;
  }

  return out;
}

/**
 * Helper: returns the suggestions that would be NEW if applied — i.e.
 * those not already present in the existing dealBreakers array
 * (case-insensitive). Lets the UI render only actionable suggestions.
 */
export function diffNewSuggestions(
  suggestions: readonly string[],
  existing: readonly string[],
): string[] {
  const have = new Set(existing.map((s) => s.toLowerCase()));
  return suggestions.filter((s) => !have.has(s.toLowerCase()));
}
