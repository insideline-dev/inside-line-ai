import { z } from "zod";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
);

const requiredStringFromNull = (fallback: string) =>
  z.preprocess(
    (value) => (value === null ? fallback : value),
    z.string().min(1),
  );

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string()),
).default([]);

const urlArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [],
  z.array(z.string().url()),
).default([]);

const optionalString = z.preprocess(
  nullToUndefined,
  z.string().min(1).optional(),
);

export const TeamLinkedinProfileSchema = z.object({
  name: requiredStringFromNull("Unknown person"),
  title: requiredStringFromNull("Unknown title"),
  company: requiredStringFromNull("Unknown company"),
  experience: stringArray,
  url: optionalUrl,
  patents: z.array(z.object({ title: z.string(), year: optionalString, url: optionalString })).default([]),
  previousExits: z.array(z.object({ company: z.string(), type: optionalString, year: optionalString, value: optionalString })).default([]),
  notableAchievements: stringArray,
  educationHighlights: stringArray,
  confidenceScore: z.preprocess(nullToUndefined, z.number().min(0).max(100).optional()),
  sources: urlArray,
});

export const TeamResearchSchema = z.object({
  linkedinProfiles: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z.array(TeamLinkedinProfileSchema),
  ).default([]),
  previousCompanies: stringArray,
  education: stringArray,
  achievements: stringArray,
  onlinePresence: z
    .object({
      github: optionalUrl,
      twitter: optionalUrl,
      personalSites: urlArray,
    })
    .default({ personalSites: [] }),
  teamSummary: z.object({
    overallExperience: z.string().default(""),
    strengthAreas: stringArray,
    gaps: stringArray,
    redFlags: stringArray,
  }).optional(),
  sources: urlArray,
});

export type TeamResearch = z.infer<typeof TeamResearchSchema>;
