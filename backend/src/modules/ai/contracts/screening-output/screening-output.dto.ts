import { createZodDto } from "nestjs-zod";
import { ScreeningOutputV1Schema } from "./v1.schema";

/**
 * Public ScreeningOutput v1 response — same shape as
 * {@link ScreeningOutputV1Schema}. Wrapping it in a `createZodDto` gives us
 * runtime validation at the controller boundary AND a generated OpenAPI
 * schema so the frontend Orval client gets typed hooks for free.
 *
 * DD callers must consume THIS DTO (or its zod schema) — not lens internals.
 */
export class ScreeningOutputResponseDto extends createZodDto(
  ScreeningOutputV1Schema,
) {}
