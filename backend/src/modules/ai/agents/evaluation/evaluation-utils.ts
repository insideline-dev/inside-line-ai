import type { BaseEvaluation } from "../../schemas";

export function clampScore(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function baseEvaluation(
  score: number,
  finding: string,
  source = "internal://pipeline-state",
): BaseEvaluation {
  const normalized = clampScore(score);

  return {
    score: normalized,
    confidence: Math.max(0.2, Math.min(0.95, Number((normalized / 100).toFixed(2)))),
    keyFindings: [finding],
    risks: [],
    dataGaps: [],
    sources: [source],
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
  return 12;
}
