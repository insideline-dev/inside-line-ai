// Maps backend triage reason codes (from screening_decision.reasonCodes) to
// human-readable copy shown in the DealCard. Keep entries short — the card
// renders a single line. Unknown codes fall back to the raw string.

export const REASON_CODE_LABELS: Record<string, string> = {
  low_overall_score: "Low overall score",
  borderline_overall_score: "Borderline scores",
  missing_materials: "Materials missing",
  "lens.market.reject": "Market red flag",
  "lens.market.review": "Market unclear",
  "lens.team.reject": "Team red flag",
  "lens.team.review": "Team unclear",
  "lens.traction.reject": "Traction red flag",
  "lens.traction.review": "Traction unclear",
};

export function labelForReasonCode(code: string): string {
  return REASON_CODE_LABELS[code] ?? code;
}

// Joins up to `max` reason-code labels into a single "why" line.
export function summarizeReasonCodes(codes: readonly string[], max = 2): string {
  if (codes.length === 0) return "No flags raised";
  const labels = codes.slice(0, max).map(labelForReasonCode);
  const extra = codes.length - labels.length;
  return extra > 0 ? `${labels.join(" • ")} +${extra} more` : labels.join(" • ");
}
