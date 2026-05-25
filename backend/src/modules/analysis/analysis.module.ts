import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { NotificationModule } from '../../notification/notification.module';
import { StorageModule } from '../../storage';
import { InvestorModule } from '../investor';
import { AnalysisService } from './analysis.service';
import { PercentileRankService } from './percentile-rank.service';
import {
  ScoringProcessor,
  PdfProcessor,
  MarketAnalysisProcessor,
} from './processors';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    NotificationModule,
    StorageModule,
    forwardRef(() => InvestorModule),
  ],
  providers: [
    AnalysisService,
    PercentileRankService,
    ScoringProcessor,
    PdfProcessor,
    MarketAnalysisProcessor,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
