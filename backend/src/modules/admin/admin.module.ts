import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AdminController } from './admin.controller';
import { AnalyticsService } from './analytics.service';
import { UserManagementService } from './user-management.service';
import { ScoringConfigService } from './scoring-config.service';
import { DataImportService } from './data-import.service';
import { QueueManagementService } from './queue-management.service';
import { CacheService } from './cache.service';
import { IntegrationHealthService } from './integration-health.service';
import { SystemConfigService } from './system-config.service';
import { BulkDataService } from './bulk-data.service';
import { AdminMatchingService } from './admin-matching.service';
import { AdminScreeningService } from './admin-screening.service';
import { AdminInvestorService } from './admin-investor.service';
import { StartupModule } from '../startup';
import { UnipileModule } from '../integrations/unipile/unipile.module';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { EarlyAccessModule } from '../early-access';
import { NotificationModule } from '../../notification/notification.module';
import { InvestorModule } from '../investor/investor.module';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    StartupModule,
    UnipileModule,
    EarlyAccessModule,
    NotificationModule,
    forwardRef(() => InvestorModule),
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_EXPIRES', '7d'),
        },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [
    CacheService,
    AnalyticsService,
    UserManagementService,
    ScoringConfigService,
    DataImportService,
    QueueManagementService,
    IntegrationHealthService,
    SystemConfigService,
    BulkDataService,
    AdminMatchingService,
    AdminScreeningService,
    AdminInvestorService,
  ],
  exports: [AnalyticsService, UserManagementService, ScoringConfigService],
})
export class AdminModule {}
