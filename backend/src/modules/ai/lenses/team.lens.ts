import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  TeamLensOutputSchema,
  type TeamLensOutput,
} from "../schemas/lens";
import { AiModelExecutionService } from "../services/ai-model-execution.service";
import { AiPromptService } from "../services/ai-prompt.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { BaseLensAgent } from "./base-lens.agent";

@Injectable()
export class TeamLens extends BaseLensAgent<TeamLensOutput> {
  readonly key = "team" as const;
  readonly description =
    "Fast first-pass screen on founder/operator quality and team coverage.";
  readonly promptKey = "lens.team" as const;
  readonly outputSchema = TeamLensOutputSchema;

  constructor(
    modelExec: AiModelExecutionService,
    prompts: AiPromptService,
    providers: AiProviderService,
    config: ConfigService,
  ) {
    super(modelExec, prompts, providers, config);
  }
}
