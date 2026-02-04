import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { NotificationModule } from '../../notification/notification.module';
import { ScoutController } from './scout.controller';
import { ScoutService } from './scout.service';
import { SubmissionService } from './submission.service';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [ScoutController],
  providers: [ScoutService, SubmissionService],
  exports: [ScoutService, SubmissionService],
})
export class ScoutModule {}
