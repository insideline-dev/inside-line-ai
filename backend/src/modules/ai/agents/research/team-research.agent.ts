import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import type { TeamResearch } from "../../schemas";
import { TeamResearchSchema } from "../../schemas";
import {
  TEAM_RESEARCH_HUMAN_PROMPT,
  TEAM_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/team-research.prompt";
import { toValidUrl } from "./url.util";

export const TeamResearchAgent: ResearchAgentConfig<TeamResearch> = {
  key: "team",
  name: "Team Research",
  systemPrompt: TEAM_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: TEAM_RESEARCH_HUMAN_PROMPT,
  schema: TeamResearchSchema,
  contextBuilder: ({ extraction, scraping, gapReport }) => ({
    companyName: extraction.companyName,
    teamMembers: scraping.teamMembers,
    companyDescription: extraction.rawText,
    industry: extraction.industry,
    websiteUrl: extraction.website,
    gapDirectives: gapReport?.categories.find(c => c.category === "team")?.researchDirectives ?? [],
    gapPriority: gapReport?.categories.find(c => c.category === "team")?.priority ?? "medium",
  }),
  fallback: ({ extraction, scraping }) => {
    const websiteUrl = toValidUrl(extraction.website);
    const linkedinProfiles: TeamResearch["linkedinProfiles"] = [];

    for (const member of scraping.teamMembers) {
      const url = toValidUrl(member.linkedinUrl);
      if (!url) {
        continue;
      }

      linkedinProfiles.push({
        name: member.name,
        title: member.role ?? "Founder",
        company: extraction.companyName,
        experience: [],
        url,
      });
    }

    return {
      linkedinProfiles,
      previousCompanies: [],
      education: [],
      achievements: [
        "Public team history needs deeper validation through external profiles",
      ],
      onlinePresence: {
        personalSites: websiteUrl ? [websiteUrl] : [],
      },
      sources: websiteUrl ? [websiteUrl] : [],
    };
  },
};
