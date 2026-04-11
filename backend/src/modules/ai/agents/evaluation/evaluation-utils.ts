import type { BaseEvaluation } from "../../schemas";

export const INTERNAL_PIPELINE_SOURCE = "internal://pipeline-state";

export function clampScore(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function tryPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function baseEvaluation(
  score: number,
  finding: string,
  source = INTERNAL_PIPELINE_SOURCE,
): BaseEvaluation {
  const normalized = clampScore(score);

  return {
    score: normalized,
    confidence: "low" as const,
    scoring: {
      overallScore: normalized,
      confidence: "low" as const,
      scoringBasis:
        "Deterministic fallback score because automated evaluation did not complete successfully.",
      subScores: [],
    },
    narrativeSummary: [
      `Current signal quality is limited. This dimension is provisionally scored at ${normalized}/100 with low confidence because automated analysis did not complete successfully.`,
      `${finding}. Automated evaluation could not be completed — this section requires manual review by the investment team.`,
      "The investment team should review primary materials manually before using this dimension in an IC decision, and should resolve the listed data gaps to restore confidence in this section.",
    ].join("\n\n"),
    keyFindings: [finding, "Automated evaluation failed — requires manual review"],
    strengths: [finding],
    risks: ["Unable to complete automated assessment"],
    dataGaps: [
      {
        gap: "Evaluation failed — used heuristic fallback",
        impact: "important",
        suggestedAction:
          "Review source materials manually and rerun the automated evaluation if needed.",
      },
    ],
    sources: [source],
    howToStrengthen: [],
  };
}

export function stageMultiplier(stage?: string): number {
  if (!stage) return 0;
  if (stage.includes("pre_seed")) return 2;
  if (stage.includes("seed")) return 6;
  if (stage.includes("series_a")) return 10;
  if (stage.includes("series_b")) return 12;
  return 8;
}

export function fundingScore(fundingTarget: number): number {
  if (fundingTarget <= 0) return 0;
  if (fundingTarget <= 500_000) return 5;
  if (fundingTarget <= 2_000_000) return 10;
  if (fundingTarget <= 5_000_000) return 14;
  return 16;
}
