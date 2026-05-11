import { Module } from "@nestjs/common";
import {
  LensRegistryService,
  LENSES_REGISTRY_TOKEN,
} from "./lens-registry.service";
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
 *
 * Versioning (DS-E2-F1-S2): the `LENSES_REGISTRY_TOKEN` provider is a single
 * source of truth that hands the registry every lens class. Adding a
 * `TeamLensV2` is a two-line change:
 *  1. Add `TeamLensV2` to `providers`.
 *  2. Add it to the `inject` + `useFactory` array below.
 * Flip `LENS_ACTIVE_VERSION_TEAM=2` in `.env` to make it the active version
 * with no code redeploy.
 */
@Module({
  providers: [
    MarketLens,
    TeamLens,
    TractionLens,
    {
      provide: LENSES_REGISTRY_TOKEN,
      useFactory: (
        market: MarketLens,
        team: TeamLens,
        traction: TractionLens,
      ) => [market, team, traction],
      inject: [MarketLens, TeamLens, TractionLens],
    },
    LensRegistryService,
  ],
  exports: [LensRegistryService, MarketLens, TeamLens, TractionLens],
})
export class LensesModule {}
