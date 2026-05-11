import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  TractionLensOutputSchema,
  type TractionLensOutput,
} from "../schemas/lens";
import { AiModelExecutionService } from "../services/ai-model-execution.service";
import { AiPromptService } from "../services/ai-prompt.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { BaseLensAgent } from "./base-lens.agent";

@Injectable()
export class TractionLens extends BaseLensAgent<TractionLensOutput> {
  readonly key = "traction" as const;
  readonly version = "1" as const;
  readonly description =
    "Fast first-pass screen on demand signal, momentum, and traction quality.";
  readonly promptKey = "lens.traction" as const;
  readonly outputSchema = TractionLensOutputSchema;

  constructor(
    modelExec: AiModelExecutionService,
    prompts: AiPromptService,
    providers: AiProviderService,
    config: ConfigService,
  ) {
    super(modelExec, prompts, providers, config);
  }
}
