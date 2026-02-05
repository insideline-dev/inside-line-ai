import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UnipileController } from './unipile.controller';
import { UnipileService } from './unipile.service';
import { LinkedInCacheService } from './linkedin-cache.service';
import { DatabaseModule } from '../../../database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [UnipileController],
  providers: [UnipileService, LinkedInCacheService],
  exports: [UnipileService],
})
export class UnipileModule {}
