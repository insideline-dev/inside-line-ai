// DS-E11-F3-S1 — DTOs for the calibration proposal review endpoints.

import { z } from "zod";
import { createZodDto } from "nestjs-zod";

/**
 * Query string for `GET /investor/calibration/proposals` — only
 * `pending` is wired in v1 but the shape lets us add `approved` /
 * `rejected` filters later without breaking the contract.
 */
const listProposalsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

export class ListCalibrationProposalsQueryDto extends createZodDto(
  listProposalsQuerySchema,
) {}

/**
 * Optional reason payload for `POST /investor/calibration/proposals/:id/reject`.
 * Free-form text the investor can use to capture *why* — useful when the
 * proposal heuristic was wrong in a non-obvious way and we want to learn
 * from the rejection.
 */
const rejectProposalBodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "Reason must be a non-empty string")
      .max(2000, "Reason must be 2000 characters or less")
      .optional(),
  })
  .strict();

export class RejectCalibrationProposalDto extends createZodDto(
  rejectProposalBodySchema,
) {}
