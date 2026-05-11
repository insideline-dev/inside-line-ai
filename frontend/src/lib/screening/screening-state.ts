import type { ScreeningOutputV1 } from "./useScreeningOutput";
import type { TriageDecision } from "./useTriageDecision";

export interface ScreeningDisplayState {
  signal: ScreeningOutputV1["overall"]["signal"] | TriageDecision["classification"] | null;
  score: number | null;
  nextAction: ScreeningOutputV1["overall"]["nextAction"] | TriageDecision["nextAction"] | null;
  reasonCodes: string[];
  missingMaterials: ScreeningOutputV1["overall"]["missingMaterials"];
  source: "decision" | "output" | "none";
}

export function resolveScreeningDisplayState(
  output: ScreeningOutputV1 | null | undefined,
  decision: TriageDecision | null | undefined,
): ScreeningDisplayState {
  if (decision) {
    return {
      signal: decision.classification,
      score: decision.overallScore,
      nextAction: decision.nextAction,
      reasonCodes: decision.reasonCodes,
      missingMaterials: output?.overall.missingMaterials ?? [],
      source: "decision",
    };
  }

  if (output) {
    return {
      signal: output.overall.signal,
      score: output.overall.score,
      nextAction: output.overall.nextAction,
      reasonCodes: [],
      missingMaterials: output.overall.missingMaterials,
      source: "output",
    };
  }

  return {
    signal: null,
    score: null,
    nextAction: null,
    reasonCodes: [],
    missingMaterials: [],
    source: "none",
  };
}
