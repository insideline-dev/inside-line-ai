import type { ResearchAgentConfig } from "../../interfaces/agent.interface";
import { z } from "zod";
import {
  TEAM_RESEARCH_HUMAN_PROMPT,
  TEAM_RESEARCH_SYSTEM_PROMPT,
} from "../../prompts/research/team-research.prompt";
import { toValidUrl } from "./url.util";

export const TeamResearchAgent: ResearchAgentConfig<string> = {
  key: "team",
  name: "Team Research",
  systemPrompt: TEAM_RESEARCH_SYSTEM_PROMPT,
  humanPromptTemplate: TEAM_RESEARCH_HUMAN_PROMPT,
  schema: z.string(),
  contextBuilder: ({ extraction, scraping, researchParameters }) => ({
    companyName: extraction.companyName,
    teamMembers: scraping.teamMembers,
    companyDescription: extraction.rawText,
    industry: extraction.industry,
    websiteUrl: extraction.website,
    specificMarket: researchParameters?.specificMarket,
    productDescription: researchParameters?.productDescription,
  }),
  fallback: ({ extraction, scraping }) => {
    const websiteUrl = toValidUrl(extraction.website);
    const members = scraping.teamMembers
      .map((member) => {
        const linkedin = toValidUrl(member.linkedinUrl);
        const details = [member.role ? `Role: ${member.role}` : "", linkedin ? `LinkedIn: ${linkedin}` : ""]
          .filter(Boolean)
          .join(" | ");
        return details.length > 0 ? `- ${member.name}: ${details}` : `- ${member.name}`;
      })
      .join("\n");

    return [
      `Team Research Report: ${extraction.companyName}`,
      "",
      "Executive Summary",
      "Automated team diligence fell back to deterministic mode due to provider/runtime constraints.",
      "",
      "Observed Team Members",
      members.length > 0 ? members : "- Team roster unavailable in scraped context.",
      "",
      "Assessment",
      "External verification for prior exits, patents, and role chronology requires manual diligence follow-up.",
      "",
      "Primary Source",
      websiteUrl ?? "No verified primary source URL available.",
    ].join("\n");
  },
};
