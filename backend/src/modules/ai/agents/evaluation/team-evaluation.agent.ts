import { Injectable } from "@nestjs/common";
import type { EvaluationPipelineInput } from "../../interfaces/agent.interface";
import { TeamEvaluationSchema, type TeamEvaluation } from "../../schemas";
import { AiConfigService } from "../../services/ai-config.service";
import { AiPromptService } from "../../services/ai-prompt.service";
import { AiModelExecutionService } from "../../services/ai-model-execution.service";
import { AiProviderService } from "../../providers/ai-provider.service";
import { BaseEvaluationAgent } from "./base-evaluation.agent";
import { baseEvaluation, clampScore, stageMultiplier } from "./evaluation-utils";

@Injectable()
export class TeamEvaluationAgent extends BaseEvaluationAgent<TeamEvaluation> {
  readonly key = "team" as const;
  protected readonly schema = TeamEvaluationSchema;
  protected readonly systemPrompt =
    "You are a startup investment analyst evaluating founder and leadership quality.";

  constructor(
    providers: AiProviderService,
    aiConfig: AiConfigService,
    promptService: AiPromptService,
    modelExecution?: AiModelExecutionService,
  ) {
    super(providers, aiConfig, promptService, modelExecution);
  }

  buildContext({ extraction, scraping, research }: EvaluationPipelineInput) {
    const linkedInProfiles = [
      ...(research.team?.linkedinProfiles ?? []),
      ...scraping.teamMembers.flatMap((member) =>
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
      ),
    ];

    return {
      teamMembers: scraping.teamMembers,
      linkedinProfiles: linkedInProfiles,
      teamResearch: research.team,
      companyDescription: extraction.rawText || extraction.tagline,
      industry: extraction.industry,
    };
  }

  fallback({ extraction, scraping }: EvaluationPipelineInput): TeamEvaluation {
    return TeamEvaluationSchema.parse({
      ...baseEvaluation(25, "Team evaluation incomplete — requires manual review"),
      founderQuality: "Founding team has domain-relevant background",
      teamCompletion: clampScore(25 + scraping.teamMembers.length * 5),
      executionCapability: "Execution capability appears moderate to strong",
      founderMarketFitScore: clampScore(25 + stageMultiplier(extraction.stage)),
      teamMembers: scraping.teamMembers.length
        ? scraping.teamMembers.map((member) => ({
            name: member.name,
            role: member.role ?? "Unknown",
            background: "Background details pending expanded enrichment",
            strengths: ["Role clarity"],
            concerns: [],
          }))
        : [
            {
              name: extraction.founderNames[0] ?? "Founding Team",
              role: "Founder",
              background: "Background details are limited",
              strengths: ["Domain interest"],
              concerns: ["Limited public profile data"],
            },
          ],
    });
  }
}
