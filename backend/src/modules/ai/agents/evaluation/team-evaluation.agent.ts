import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { TeamEvaluationSchema, type TeamEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, clampScore, stageMultiplier } from "./evaluation-utils";
import { OpenAiDirectClientService } from "../../services/openai-direct-client.service";
import { TeamEvaluationOpenAiSchema } from "../../schemas/evaluations/openai/team-openai.schema";

@Injectable()
export class TeamEvaluationAgent extends BaseEvaluationAgent<TeamEvaluation> {
  readonly key = "team" as const;
  protected readonly schema = TeamEvaluationSchema;
  protected readonly openAiSchema = TeamEvaluationOpenAiSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating founder and leadership quality.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
    openAiDirect?: OpenAiDirectClientService,
  ) {
    super(providers, aiConfig, promptService, modelExecution, openAiDirect);
  }

  protected override getAgentTemplateVariables(
    pipelineData: EvaluationPipelineInput,
  ): Record<string, string> {
    const teamMembers = Array.isArray(pipelineData.scraping.teamMembers)
      ? pipelineData.scraping.teamMembers
      : [];

    const teamMembersData =
      teamMembers.length > 0
        ? teamMembers
            .map((member) => {
              const parts = [`Name: ${member.name}`];
              if (member.role) parts.push(`Role: ${member.role}`);
              if (member.linkedinUrl) parts.push(`LinkedIn: ${member.linkedinUrl}`);
              if (member.linkedinProfile?.headline)
                parts.push(`Headline: ${member.linkedinProfile.headline}`);
              if (member.linkedinProfile?.summary)
                parts.push(`Summary: ${member.linkedinProfile.summary}`);
              return parts.join("\n");
            })
            .join("\n\n")
        : "Not provided";

    return {
      teamMembersData,
      teamResearchOutput: pipelineData.research.team ?? "Not provided",
    };
  }

  buildContext(pipelineData: EvaluationPipelineInput) {
    const { extraction, scraping } = pipelineData;
    const teamMembers = Array.isArray(scraping.teamMembers)
      ? scraping.teamMembers
      : [];
    const linkedInProfiles = teamMembers.flatMap((member) =>
      member.linkedinProfile
        ? [
            {
              name: member.name,
              headline: member.linkedinProfile.headline,
              summary: member.linkedinProfile.summary,
              experience: member.linkedinProfile.experience,
              education: member.linkedinProfile.education,
              url: member.linkedinUrl,
            },
          ]
        : [],
    );

    return {
      teamMembers,
      linkedinProfiles: linkedInProfiles,
      researchReportText: this.buildResearchReportText(pipelineData),
      companyDescription: extraction.rawText || extraction.tagline,
      industry: extraction.industry,
    };
  }

  fallback({ extraction, scraping }: EvaluationPipelineInput): TeamEvaluation {
    const teamMembers = Array.isArray(scraping.teamMembers)
      ? scraping.teamMembers
      : [];
    const founderFitScore = 25 + stageMultiplier(extraction.stage);
    return TeamEvaluationSchema.parse({
      ...baseEvaluation(25, "Team evaluation incomplete — requires manual review"),
      founderMarketFit: {
        score: clampScore(founderFitScore),
        why: "Founder-market fit assessment pending — insufficient data for automated evaluation",
      },
      teamComposition: {
        businessLeadership: false,
        technicalCapability: false,
        domainExpertise: false,
        gtmCapability: false,
        sentence: "Team composition assessment pending — automated evaluation did not complete",
        reason: "Team composition assessment pending — automated evaluation did not complete",
      },
      strengths: [],
      teamMembers: teamMembers.length
        ? teamMembers.map((member) => ({
            name: member.name,
            role: member.role ?? "Unknown",
            background: "Background details pending expanded enrichment",
            strengths: ["Role clarity"],
            concerns: [],
          }))
        : [
            {
              name: extraction.founderNames?.[0] ?? "Founding Team",
              role: "Founder",
              background: "Background details are limited",
              strengths: ["Domain interest"],
              concerns: ["Limited public profile data"],
            },
          ],
      founderRecommendations: [],
      founderPitchRecommendations: [],
    });
  }
}
