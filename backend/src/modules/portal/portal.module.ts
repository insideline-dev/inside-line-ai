import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { NotificationModule } from '../../notification';
import { AuthModule } from '../../auth';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { SubmissionService } from './submission.service';

@Module({
  imports: [DatabaseModule, NotificationModule, AuthModule],
  controllers: [PortalController],
  providers: [PortalService, SubmissionService],
  exports: [PortalService, SubmissionService],
})
export class PortalModule {}
