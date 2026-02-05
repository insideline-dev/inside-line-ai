import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { StorageModule } from '../../storage';
import { StartupController } from './startup.controller';
import { StartupService } from './startup.service';
import { DraftService } from './draft.service';
import { PdfService } from './pdf.service';

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule],
  controllers: [StartupController],
  providers: [StartupService, DraftService, PdfService],
  exports: [StartupService, DraftService, PdfService],
})
export class StartupModule {}
