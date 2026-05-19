/**
 * Public ScreeningOutput contract barrel — the ONLY surface DD code should
 * import from. Re-exports are deliberately limited to v1 + a "latest" alias.
 *
 * Do NOT re-export anything from `modules/ai/lenses/` or
 * `modules/ai/schemas/lens/` here. If you find yourself wanting to, you are
 * leaking Screening internals into DD and the contract is broken.
 */

export {
  ScreeningEvidenceConfidenceSchema,
  ScreeningEvidenceSchema,
  ScreeningEvidenceSourceTypeSchema,
  ScreeningHandoffEvidenceSchema,
  ScreeningHandoffIssueSchema,
  ScreeningHandoffSchema,
  ScreeningLensV1Schema,
  ScreeningOutputV1Schema,
  ScreeningOverallV1Schema,
} from "./v1.schema";

export {
  ScreeningLensScoreV2Schema,
  ScreeningOutputV2Schema,
} from "./v2.schema";

export type { ScreeningLensScoreV2, ScreeningOutputV2 } from "./v2.schema";

export {
  ScreeningNextActionSchema,
  ScreeningSignalSchema,
  resolveCanonicalScreeningOutcome,
} from "./screening-outcome";

export type {
  ScreeningEvidence,
  ScreeningEvidenceConfidence,
  ScreeningEvidenceSourceType,
  ScreeningHandoff,
  ScreeningHandoffEvidence,
  ScreeningHandoffIssue,
  ScreeningLensV1,
  ScreeningNextAction,
  ScreeningOutputV1,
  ScreeningOverallV1,
  ScreeningSignal,
} from "./v1.schema";

import { ScreeningOutputV1Schema } from "./v1.schema";
import type { ScreeningOutputV1 } from "./v1.schema";
import { ScreeningOutputV2Schema } from "./v2.schema";
import type { ScreeningOutputV2 } from "./v2.schema";

/**
 * Alias: whatever the current latest version is. Today: v2 (adds thesisFit
 * + lensScores roll-up to v1). v1 is frozen as the historical contract;
 * callers that want a stable, narrower shape should import
 * `ScreeningOutputV1` explicitly.
 *
 * Discriminate at runtime via the `version` literal: v1 has `version: 1`,
 * v2 has `version: 2`.
 */
export const ScreeningOutputLatestSchema = ScreeningOutputV2Schema;
export type ScreeningOutput = ScreeningOutputV2;
export type AnyScreeningOutput = ScreeningOutputV1 | ScreeningOutputV2;

export { ScreeningOutputService } from "./screening-output.service";
export { ScreeningOutputResponseDto } from "./screening-output.dto";
