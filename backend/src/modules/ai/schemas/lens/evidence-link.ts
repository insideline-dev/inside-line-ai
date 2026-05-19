export const LENS_EVIDENCE_SOURCE_TYPES = [
  "deck_page",
  "public_url",
  "enrichment_call",
  "research_source",
  "internal_trace",
] as const;

export type LensEvidenceSourceType =
  (typeof LENS_EVIDENCE_SOURCE_TYPES)[number];

export interface NormalizedLensEvidenceLink {
  sourceType: LensEvidenceSourceType;
  sourceLabel: string;
  sourceRef: string;
  url?: string;
  pageNumber?: number;
}

const DECK_PAGE_RE = /^deck\s*:\s*p(?:age)?\s*(\d+)$/i;
const ENRICHMENT_RE = /^(enrichment|api(?:[_ -]?call)?|call)\s*:/i;
const RESEARCH_RE = /^(research|source)\s*:/i;

export function normalizeLensEvidenceLink(
  source: string,
): NormalizedLensEvidenceLink {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("Lens evidence source must be non-empty");
  }

  const deckMatch = trimmed.match(DECK_PAGE_RE);
  if (deckMatch) {
    const pageNumber = Number.parseInt(deckMatch[1] ?? "", 10);
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      throw new Error(`Invalid deck page citation: ${trimmed}`);
    }
    const sourceRef = `deck:p${pageNumber}`;
    return {
      sourceType: "deck_page",
      sourceLabel: `Pitch deck • page ${pageNumber}`,
      sourceRef,
      pageNumber,
    };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return {
        sourceType: "public_url",
        sourceLabel: url.hostname,
        sourceRef: trimmed,
        url: trimmed,
      };
    }
  } catch {
    // fall through to non-URL source types
  }

  if (ENRICHMENT_RE.test(trimmed)) {
    return {
      sourceType: "enrichment_call",
      sourceLabel: trimmed,
      sourceRef: trimmed,
    };
  }

  if (RESEARCH_RE.test(trimmed)) {
    return {
      sourceType: "research_source",
      sourceLabel: trimmed,
      sourceRef: trimmed,
    };
  }

  return {
    sourceType: "internal_trace",
    sourceLabel: trimmed,
    sourceRef: trimmed,
  };
}
