import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentMailController } from './agentmail.controller';
import { AgentMailService } from './agentmail.service';
import { AgentMailClientService } from './agentmail-client.service';
import { AttachmentService } from './attachment.service';
import { InvestorInboxBridgeService } from './investor-inbox-bridge.service';
import { AgentMailSignatureGuard } from './guards';
import { DatabaseModule } from '../../../database/database.module';
import { StorageModule } from '../../../storage/storage.module';
import { NotificationModule } from '../../../notification/notification.module';
import { ClaraModule } from '../../clara/clara.module';
import { StartupModule } from '../../startup';

@Module({
  imports: [ConfigModule, DatabaseModule, StorageModule, NotificationModule, forwardRef(() => ClaraModule), StartupModule],
  controllers: [AgentMailController],
  providers: [AgentMailService, AgentMailClientService, AttachmentService, AgentMailSignatureGuard, InvestorInboxBridgeService],
  exports: [AgentMailService, AgentMailClientService],
})
export class AgentMailModule {}
