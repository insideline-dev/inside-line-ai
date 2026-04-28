import { Module } from "@nestjs/common";
import { ScreeningOutputService } from "./screening-output/screening-output.service";

/**
 * Owns the public AI contracts surface that downstream modules (Due Diligence,
 * Synthesis, future Deal Agents) depend on. The point of this module is to
 * give DD a stable, versioned import target that does NOT pull in lens
 * internals.
 */
@Module({
  providers: [ScreeningOutputService],
  exports: [ScreeningOutputService],
})
export class ContractsModule {}
