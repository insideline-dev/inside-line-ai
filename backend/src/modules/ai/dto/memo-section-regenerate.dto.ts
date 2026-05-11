import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const MemoSectionSourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

// Output schema for `POST /startups/:startupId/memo/sections/:sectionKey/regenerate`.
// Mirrors the persisted memo section shape (title/content/highlights/...) and adds
// the DG-E1-F1-S2 metadata (sectionKey + regeneratedAt) so the UI can show a
// "just regenerated" indicator and confirm overwrites without a second fetch.
export const RegenerateMemoSectionResponseSchema = z.object({
  startupId: z.string(),
  sectionKey: z.string(),
  regeneratedAt: z.string(),
  usedFallback: z.boolean(),
  // True iff this section was previously regenerated via the section-scoped
  // endpoint — the UI surfaces a confirm-overwrite warning when this is true.
  overwroteOperatorEdits: z.boolean(),
  section: z.object({
    sectionKey: z.string(),
    title: z.string(),
    content: z.string(),
    highlights: z.array(z.string()),
    concerns: z.array(z.string()),
    sources: z.array(MemoSectionSourceSchema),
    regeneratedAt: z.string(),
  }),
});

export type RegenerateMemoSectionResponse = z.infer<
  typeof RegenerateMemoSectionResponseSchema
>;

export class RegenerateMemoSectionResponseDto extends createZodDto(
  RegenerateMemoSectionResponseSchema,
) {}
