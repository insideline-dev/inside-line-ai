import { z } from "zod";

export const TeamLinkedinProfileSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  experience: z.array(z.string()).default([]),
  url: z.string().url(),
});

export const TeamResearchSchema = z.object({
  linkedinProfiles: z.array(TeamLinkedinProfileSchema).default([]),
  previousCompanies: z.array(z.string()).default([]),
  education: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  onlinePresence: z
    .object({
      github: z.string().url().optional(),
      twitter: z.string().url().optional(),
      personalSites: z.array(z.string().url()).default([]),
    })
    .default({ personalSites: [] }),
  sources: z.array(z.string().url()).default([]),
});

export type TeamResearch = z.infer<typeof TeamResearchSchema>;
