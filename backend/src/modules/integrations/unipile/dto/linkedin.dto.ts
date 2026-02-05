import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ============================================================================
// QUERY DTOs
// ============================================================================

export const GetLinkedInProfileQuerySchema = z.object({
  url: z.string().url('Must be a valid LinkedIn URL'),
});

export const SearchLinkedInQuerySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().optional(),
});

export type GetLinkedInProfileQuery = z.infer<typeof GetLinkedInProfileQuerySchema>;
export type SearchLinkedInQuery = z.infer<typeof SearchLinkedInQuerySchema>;

export class GetLinkedInProfileQueryDto extends createZodDto(GetLinkedInProfileQuerySchema) {}
export class SearchLinkedInQueryDto extends createZodDto(SearchLinkedInQuerySchema) {}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export const LinkedInCompanySchema = z.object({
  name: z.string(),
  title: z.string(),
});

export const LinkedInExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  current: z.boolean(),
});

export const LinkedInEducationSchema = z.object({
  school: z.string(),
  degree: z.string(),
  fieldOfStudy: z.string(),
  startYear: z.number(),
  endYear: z.number().nullable(),
});

// LinkedInProfile interface is defined in entities/linkedin-cache.schema.ts
// This schema is for validation purposes only
