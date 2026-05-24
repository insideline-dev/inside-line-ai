import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MarketLensOutputSchema,
  type MarketLensOutput,
} from "../schemas/lens";
import { AiModelExecutionService } from "../services/ai-model-execution.service";
import { AiPromptService } from "../services/ai-prompt.service";
import { AiProviderService } from "../providers/ai-provider.service";
import { BaseLensAgent } from "./base-lens.agent";

@Injectable()
export class MarketLens extends BaseLensAgent<MarketLensOutput> {
  readonly key = "market" as const;
  readonly version = "1" as const;
  readonly description =
    "Research-capable first-pass screen on whether a startup is operating in a venture-scale market. Does scoped web search to validate TAM / growth / competitive landscape.";
  readonly promptKey = "lens.market" as const;
  readonly outputSchema = MarketLensOutputSchema;
  // Pipeline-restructure (2026-05-24): RESEARCH no longer runs before
  // screening. The market lens needs to gather its own scoped market
  // signal, so it runs as a research-capable agent.
  protected override webSearchEnabled(): boolean {
    return true;
  }

  constructor(
    modelExec: AiModelExecutionService,
    prompts: AiPromptService,
    providers: AiProviderService,
    config: ConfigService,
  ) {
    super(modelExec, prompts, providers, config);
  }
}
