import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { NotificationModule } from '../../notification/notification.module';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';
import { SubmissionService } from './submission.service';
import { CommissionService } from './commission.service';
import { ScoutMetricsService } from './scout-metrics.service';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [ScoutController],
  providers: [ScoutService, SubmissionService, CommissionService, ScoutMetricsService],
  exports: [ScoutService, SubmissionService, CommissionService, ScoutMetricsService],
})
export class ScoutModule {}
