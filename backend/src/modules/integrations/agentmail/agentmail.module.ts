import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentMailController } from './agentmail.controller';
import { AgentMailService } from './agentmail.service';
import { AttachmentService } from './attachment.service';
import { AgentMailSignatureGuard } from './guards';
import { DatabaseModule } from '../../../database/database.module';
import { StorageModule } from '../../../storage/storage.module';
import { NotificationModule } from '../../../notification/notification.module';

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, NotificationModule],
  controllers: [AgentMailController],
  providers: [AgentMailService, AttachmentService, AgentMailSignatureGuard],
  exports: [AgentMailService],
})
export class AgentMailModule {}
