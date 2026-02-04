import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { AssetService } from './asset.service';
import { StorageController } from './storage.controller';

@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService, AssetService],
  exports: [StorageService, AssetService],
})
export class StorageModule {}
