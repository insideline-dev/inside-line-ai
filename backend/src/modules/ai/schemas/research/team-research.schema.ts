import { z } from "zod";

const nullToUndefined = (value: unknown): unknown =>
  value === null ? undefined : value;

const optionalUrl = z.preprocess(
  nullToUndefined,
  z.string().url().optional(),
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

export const TeamLinkedinProfileSchema = z.object({
  name: z.preprocess(nullToUndefined, z.string().min(1)),
  title: z.preprocess(nullToUndefined, z.string().min(1)),
  company: z.preprocess(nullToUndefined, z.string().min(1)),
  experience: stringArray,
  url: optionalUrl,
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
  sources: urlArray,
});

export type TeamResearch = z.infer<typeof TeamResearchSchema>;
