import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../../database";
import { NotificationModule } from "../../../notification/notification.module";
import { PipelineGraphCompilerService } from "../services/pipeline-graph-compiler.service";
import { PipelineFlowConfigService } from "../services/pipeline-flow-config.service";
import { ErrorRecoveryService } from "./error-recovery.service";
import { PhaseTransitionService } from "./phase-transition.service";
import { ProgressTrackerService } from "./progress-tracker.service";

@Module({
  imports: [ConfigModule, DatabaseModule, NotificationModule],
  providers: [
    ProgressTrackerService,
    PhaseTransitionService,
    ErrorRecoveryService,
    PipelineFlowConfigService,
    PipelineGraphCompilerService,
  ],
  exports: [
    ProgressTrackerService,
    PhaseTransitionService,
    ErrorRecoveryService,
    PipelineFlowConfigService,
    PipelineGraphCompilerService,
  ],
})
export class OrchestratorModule {}
