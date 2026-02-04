import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database';
import { NotificationModule } from '../../../notification';
import { StorageModule } from '../../../storage';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { TwilioApiClientService } from './twilio-api-client.service';

@Module({
  imports: [DatabaseModule, NotificationModule, StorageModule],
  controllers: [TwilioController],
  providers: [TwilioService, TwilioApiClientService],
  exports: [TwilioService, TwilioApiClientService],
})
export class TwilioModule {}
