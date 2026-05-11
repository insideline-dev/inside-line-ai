// Maps backend triage reason codes (from screening_decision.reasonCodes) to
// human-readable copy shown in the DealCard. Keep entries short — the card
// renders a single line. Unknown codes fall back to the raw string.

export const REASON_CODE_LABELS: Record<string, string> = {
  low_overall_score: "Low overall score",
  borderline_overall_score: "Borderline scores",
  missing_materials: "Materials missing",
  out_of_thesis_scope: "Out of thesis scope",
  no_lens_signals: "No screening signals",
  "lens.market.reject": "Market red flag",
  "lens.market.review": "Market unclear",
  "lens.market.low_evidence": "Market needs more evidence",
  "lens.team.reject": "Team red flag",
  "lens.team.review": "Team unclear",
  "lens.team.low_evidence": "Team needs more evidence",
  "lens.traction.reject": "Traction red flag",
  "lens.traction.review": "Traction unclear",
  "lens.traction.low_evidence": "Traction needs more evidence",
};

// Pattern matches for lens-keyed codes (`lens.<key>.<suffix>`) — keeps the
// surface forward-compatible when new lenses are registered (e.g. gtm,
// product) without code changes here.
const LENS_CODE_PATTERN = /^lens\.([^.]+)\.(reject|review|low_evidence)$/;
const DEALBREAKER_CODE_PATTERN = /^dealbreaker:(.+)$/i;
const LENS_SUFFIX_LABELS: Record<string, string> = {
  reject: "red flag",
  review: "unclear",
  low_evidence: "needs more evidence",
};

export function labelForReasonCode(code: string): string {
  const explicit = REASON_CODE_LABELS[code];
  if (explicit) return explicit;
  const dealbreakerMatch = code.match(DEALBREAKER_CODE_PATTERN);
  if (dealbreakerMatch) {
    return `Dealbreaker hit: ${dealbreakerMatch[1].trim()}`;
  }
  const match = code.match(LENS_CODE_PATTERN);
  if (match) {
    const lens = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const suffix = LENS_SUFFIX_LABELS[match[2]];
    return suffix ? `${lens} ${suffix}` : code;
  }
  return code;
}

// Joins up to `max` reason-code labels into a single "why" line.
export function summarizeReasonCodes(codes: readonly string[], max = 2): string {
  if (codes.length === 0) return "No flags raised";
  const labels = codes.slice(0, max).map(labelForReasonCode);
  const extra = codes.length - labels.length;
  return extra > 0 ? `${labels.join(" • ")} +${extra} more` : labels.join(" • ");
}
