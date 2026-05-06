import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../../database";
import { ContractsModule } from "../../contracts/contracts.module";
import { StartupModule } from "../../../startup/startup.module";
import { ScreeningTriageController } from "./screening-triage.controller";
import { ScreeningTriageService } from "./screening-triage.service";

/**
 * Owns the deal-level triage layer: turns per-lens screening signals into a
 * single ADVANCE / REVIEW / REJECT classification, persists the decision,
 * and exposes a read-only endpoint for the frontend.
 *
 * The SCREENING phase processor consumes {@link ScreeningTriageService}
 * directly — it does not need to import this module because the AI module
 * registers the service in its provider graph (see `AiModule`).
 */
@Module({
  imports: [DatabaseModule, ContractsModule, StartupModule],
  controllers: [ScreeningTriageController],
  providers: [ScreeningTriageService],
  exports: [ScreeningTriageService],
})
export class ScreeningTriageModule {}
