import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database";
import { NotificationModule } from "../../../notification/notification.module";
import { ErrorRecoveryService } from "./error-recovery.service";
import { PhaseTransitionService } from "./phase-transition.service";
import { ProgressTrackerService } from "./progress-tracker.service";

@Module({
  imports: [DatabaseModule, NotificationModule],
  providers: [
    ProgressTrackerService,
    PhaseTransitionService,
    ErrorRecoveryService,
  ],
  exports: [
    ProgressTrackerService,
    PhaseTransitionService,
    ErrorRecoveryService,
  ],
})
export class OrchestratorModule {}
