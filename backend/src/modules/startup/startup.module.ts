import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { StorageModule } from '../../storage';
import { NotificationModule } from '../../notification/notification.module';
import { StartupController } from './startup.controller';
import { StartupService } from './startup.service';
import { DraftService } from './draft.service';
import { PdfService } from './pdf.service';
import { DataRoomService } from './data-room.service';
import { InvestorInterestService } from './investor-interest.service';
import { MeetingService } from './meeting.service';
import { StartupIntakeService } from './startup-intake.service';
import { PdfRenderService } from './pdf/pdf-render.service';
import { PrintTokenService } from './pdf/print-token.service';

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule, NotificationModule],
  controllers: [StartupController],
  providers: [
    StartupService,
    DraftService,
    PdfService,
    PdfRenderService,
    PrintTokenService,
    DataRoomService,
    InvestorInterestService,
    MeetingService,
    StartupIntakeService,
  ],
  exports: [
    StartupService,
    DraftService,
    PdfService,
    PdfRenderService,
    PrintTokenService,
    DataRoomService,
    InvestorInterestService,
    MeetingService,
    StartupIntakeService,
  ],
})
export class StartupModule {}
