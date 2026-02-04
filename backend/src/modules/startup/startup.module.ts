import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { StorageModule } from '../../storage';
import { StartupController } from './startup.controller';
import { StartupService } from './startup.service';
import { DraftService } from './draft.service';

@Module({
  imports: [DatabaseModule, QueueModule, StorageModule],
  controllers: [StartupController],
  providers: [StartupService, DraftService],
  exports: [StartupService, DraftService],
})
export class StartupModule {}
