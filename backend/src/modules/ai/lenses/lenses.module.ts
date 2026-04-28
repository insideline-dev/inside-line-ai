import { Module } from "@nestjs/common";
import { LensRegistryService } from "./lens-registry.service";
import { MarketLens } from "./market.lens";
import { TeamLens } from "./team.lens";
import { TractionLens } from "./traction.lens";

/**
 * Owns the screening-lens registry. Lives inside the AI module's import graph
 * so it can be consumed by `ScreeningProcessor` and (eventually) the Deal
 * Agent tool surface (DS-E7).
 *
 * The lenses themselves depend on `AiModelExecutionService`, `AiPromptService`,
 * and `AiProviderService` — all provided by `AiModule` (`@Global()`) so no
 * extra imports needed here.
 */
@Module({
  providers: [MarketLens, TeamLens, TractionLens, LensRegistryService],
  exports: [LensRegistryService, MarketLens, TeamLens, TractionLens],
})
export class LensesModule {}
