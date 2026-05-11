import type {
  ScreeningHandoffEvidenceV1,
  ScreeningHandoffIssueV1,
  ScreeningOutputV1,
} from "./useScreeningOutput";
import type { TriageDecision } from "./useTriageDecision";
import { labelForReasonCode } from "./reason-codes";

export type ScreeningEvidenceSeed = ScreeningHandoffEvidenceV1;

export type ScreeningFollowUpSeed = ScreeningHandoffIssueV1;

const LENS_LABEL_OVERRIDES: Record<string, string> = {
  team: "Team",
  market: "Market",
  product: "Product",
  traction: "Traction",
  businessmodel: "Business Model",
  gtm: "Go-to-Market",
  financials: "Financials",
  competitiveadvantage: "Competitive Advantage",
  legal: "Legal",
  dealterms: "Deal Terms",
  exitpotential: "Exit Potential",
  synthesis: "Synthesis",
};

const MISSING_MATERIAL_LABELS: Record<string, string> = {
  deck: "Pitch deck",
  product_description: "Product description",
  team: "Team info",
  deal_terms: "Deal terms",
  website: "Website",
};

function normalizeLensKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function formatScreeningLensLabel(value: string): string {
  const normalized = normalizeLensKey(value);
  const override = LENS_LABEL_OVERRIDES[normalized];
  if (override) return override;

  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScreeningMissingMaterialLabel(value: string): string {
  return MISSING_MATERIAL_LABELS[value] ?? formatScreeningLensLabel(value);
}

function buildReasonCodeFollowUpLabel(code: string): string {
  const match = code.match(/^lens\.([^.]+)\.(reject|review|low_evidence)$/);
  if (!match) {
    return labelForReasonCode(code);
  }

  const lensLabel = formatScreeningLensLabel(match[1]);
  const suffix =
    match[2] === "reject"
      ? "blocker"
      : match[2] === "review"
        ? "needs follow-up"
        : "needs more evidence";
  return `${lensLabel} ${suffix}`;
}

function buildReasonCodeFollowUpSummary(code: string): string {
  const match = code.match(/^lens\.([^.]+)\.(reject|review|low_evidence)$/);
  if (match) {
    const lensLabel = formatScreeningLensLabel(match[1]);
    switch (match[2]) {
      case "reject":
        return `${lensLabel} remains a screening blocker.`;
      case "review":
        return `${lensLabel} still needs follow-up before DD can rely on it.`;
      case "low_evidence":
        return `${lensLabel} needs more evidence before DD can rely on it.`;
    }
  }

  switch (code) {
    case "low_overall_score":
      return "The overall screening score is still too low to treat the deal as cleared.";
    case "borderline_overall_score":
      return "The overall screening score is still in the review band.";
    case "missing_materials":
      return "Screening still needs the missing materials before it can be treated as complete.";
    case "out_of_thesis_scope":
      return "Confirm whether this startup fits the current investment thesis.";
    case "no_lens_signals":
      return "Screening did not produce enough usable lens signals yet.";
    default:
      return `${labelForReasonCode(code)} still needs follow-up.`;
  }
}

export function collectScreeningEvidenceSeeds(
  output: ScreeningOutputV1 | null | undefined,
): ScreeningEvidenceSeed[] {
  const handoffSeeds = output?.handoff?.evidenceSeeds;
  if (handoffSeeds) {
    return handoffSeeds;
  }

  if (!output) return [];

  const seen = new Set<string>();
  const rows: ScreeningEvidenceSeed[] = [];

  for (const lens of output.lenses) {
    const lensLabel = formatScreeningLensLabel(lens.key);

    for (const evidence of lens.evidence) {
      const claim = evidence.claim.trim();
      if (!claim) continue;

      const source = evidence.source?.trim() || undefined;
      const dedupeKey = [lens.key, claim.toLowerCase(), source?.toLowerCase() ?? ""].join("|");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push({
        lensKey: lens.key,
        lensLabel,
        claim,
        source,
        confidence: evidence.confidence,
        lensScore: lens.score,
        signal: lens.signal,
      });
    }
  }

  return rows;
}

export function collectScreeningFollowUpSeeds(
  output: ScreeningOutputV1 | null | undefined,
  decision?: Pick<TriageDecision, "reasonCodes"> | null,
): ScreeningFollowUpSeed[] {
  const handoffIssues = output?.handoff?.openIssues;
  if (handoffIssues) {
    return handoffIssues;
  }

  if (!output && !decision) return [];

  const seen = new Set<string>();
  const rows: ScreeningFollowUpSeed[] = [];
  const push = (seed: ScreeningFollowUpSeed) => {
    const dedupeKey = `${seed.label.toLowerCase()}|${seed.summary.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    rows.push(seed);
  };

  for (const code of output?.overall.missingMaterials ?? []) {
    const label = formatScreeningMissingMaterialLabel(code);
    push({
      key: `missing:${code}`,
      label,
      summary: `${label} is still missing from screening.`,
      source: "screening-output",
    });
  }

  if (decision?.reasonCodes.length) {
    for (const code of decision.reasonCodes) {
      if (code === "missing_materials") continue;
      push({
        key: `decision:${code}`,
        label: buildReasonCodeFollowUpLabel(code),
        summary: buildReasonCodeFollowUpSummary(code),
        source: "triage-decision",
      });
    }
  } else {
    for (const lens of output?.lenses ?? []) {
      if (lens.signal === "advance") continue;
      const label = formatScreeningLensLabel(lens.key);
      push({
        key: `lens:${lens.key}:${lens.signal}`,
        label,
        summary:
          lens.signal === "reject"
            ? `${label} is still a screening blocker.`
            : `${label} still needs follow-up before DD can rely on it.`,
        source: "screening-output",
      });
    }
  }

  return rows;
}

export function getScreeningEvidencePreview(
  output: ScreeningOutputV1 | null | undefined,
  limit = 3,
): ScreeningEvidenceSeed[] {
  return collectScreeningEvidenceSeeds(output).slice(0, limit);
}
