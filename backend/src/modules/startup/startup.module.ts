import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { StorageModule } from '../../storage';
import { StartupController } from './startup.controller';
import { StartupService } from './startup.service';
import { DraftService } from './draft.service';
import { PdfService } from './pdf.service';
import { DataRoomService } from './data-room.service';
import { InvestorInterestService } from './investor-interest.service';
import { MeetingService } from './meeting.service';

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule],
  controllers: [StartupController],
  providers: [
    StartupService,
    DraftService,
    PdfService,
    DataRoomService,
    InvestorInterestService,
    MeetingService,
  ],
  exports: [
    StartupService,
    DraftService,
    PdfService,
    DataRoomService,
    InvestorInterestService,
    MeetingService,
  ],
})
export class StartupModule {}
