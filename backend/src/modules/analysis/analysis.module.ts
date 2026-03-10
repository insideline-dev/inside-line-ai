import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { NotificationModule } from '../../notification/notification.module';
import { StorageModule } from '../../storage';
import { InvestorModule } from '../investor';
import { AnalysisService } from './analysis.service';
import {
  ScoringProcessor,
  // MatchingProcessor is deprecated — use modules/ai/processors/matching.processor.ts instead
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
    ScoringProcessor,
    // MatchingProcessor removed — legacy, replaced by AI matching processor in ai.module.ts
    PdfProcessor,
    MarketAnalysisProcessor,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
