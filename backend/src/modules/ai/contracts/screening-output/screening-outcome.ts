import { z } from "zod";
import type { MissingMaterialCode } from "./missing-materials";

/**
 * Canonical screening states shared by the triage decision and the public
 * ScreeningOutput contract.
 *
 * `signal` is the user-facing state. `nextAction` is the operational follow-up
 * the UI can show without re-deriving policy semantics.
 */
export const ScreeningSignalSchema = z.enum(["advance", "review", "reject"]);
export type ScreeningSignal = z.infer<typeof ScreeningSignalSchema>;

export const ScreeningNextActionSchema = z.enum([
  "continue_evaluation",
  "manual_review",
  "request_materials",
  "stop",
]);
export type ScreeningNextAction = z.infer<typeof ScreeningNextActionSchema>;

export interface CanonicalScreeningOutcomeInput {
  signal: ScreeningSignal;
  reasonCodes: readonly string[];
  missingMaterials: ReadonlyArray<MissingMaterialCode>;
}

export interface CanonicalScreeningOutcome {
  signal: ScreeningSignal;
  nextAction: ScreeningNextAction;
  reasonCodes: string[];
  missingMaterials: MissingMaterialCode[];
}

/**
 * Turns the raw screening signal into the canonical user-facing outcome.
 *
 * Rules:
 * - `reject` always maps to `stop`.
 * - Missing materials downgrade any non-reject signal to `review` and use the
 *   `request_materials` next action.
 * - Otherwise `review` maps to `manual_review` and `advance` maps to
 *   `continue_evaluation`.
 * - `missing_materials` is added as a stable technical reason code only when
 *   the canonical result is a review hold.
 */
export function resolveCanonicalScreeningOutcome(
  input: CanonicalScreeningOutcomeInput,
): CanonicalScreeningOutcome {
  const missingMaterials = [...input.missingMaterials];

  if (input.signal === "reject") {
    return {
      signal: "reject",
      nextAction: "stop",
      reasonCodes: [...input.reasonCodes],
      missingMaterials,
    };
  }

  if (missingMaterials.length > 0) {
    const reasonCodes = input.reasonCodes.includes("missing_materials")
      ? [...input.reasonCodes]
      : [...input.reasonCodes, "missing_materials"];

    return {
      signal: "review",
      nextAction: "request_materials",
      reasonCodes,
      missingMaterials,
    };
  }

  if (input.signal === "review") {
    return {
      signal: "review",
      nextAction: "manual_review",
      reasonCodes: [...input.reasonCodes],
      missingMaterials,
    };
  }

  return {
    signal: "advance",
    nextAction: "continue_evaluation",
    reasonCodes: [...input.reasonCodes],
    missingMaterials,
  };
}
