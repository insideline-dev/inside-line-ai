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
  ScreeningLensV1Schema,
  ScreeningOutputV1Schema,
  ScreeningOverallV1Schema,
  ScreeningSignalSchema,
} from "./v1.schema";

export type {
  ScreeningEvidence,
  ScreeningEvidenceConfidence,
  ScreeningLensV1,
  ScreeningOutputV1,
  ScreeningOverallV1,
  ScreeningSignal,
} from "./v1.schema";

import { ScreeningOutputV1Schema } from "./v1.schema";
import type { ScreeningOutputV1 } from "./v1.schema";

/** Alias: whatever the current latest version is. Today: v1. */
export const ScreeningOutputLatestSchema = ScreeningOutputV1Schema;
export type ScreeningOutput = ScreeningOutputV1;

export { ScreeningOutputService } from "./screening-output.service";
export { ScreeningOutputResponseDto } from "./screening-output.dto";
