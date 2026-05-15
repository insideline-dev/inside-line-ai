import { Module } from "@nestjs/common";
import { MarketLens } from "./market.lens";
import { TeamLens } from "./team.lens";
import { TractionLens } from "./traction.lens";

/**
 * Lens agents exposed for direct DI into the screening processor. Versioning
 * is owned by the prompt catalog (`activeVersion` on each `lens.*` prompt
 * key), so there's no registry / hot-swap layer here — lenses are ordinary
 * agents.
 *
 * Adding a new lens: declare the class, add it to `providers` + `exports`,
 * and inject it into `ScreeningProcessor` alongside the existing three.
 */
@Module({
  providers: [MarketLens, TeamLens, TractionLens],
  exports: [MarketLens, TeamLens, TractionLens],
})
export class LensesModule {}
