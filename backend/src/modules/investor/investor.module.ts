import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { ThesisService } from './thesis.service';
import { ScoringService } from './scoring.service';
import { MatchService } from './match.service';
import { InvestorController } from './investor.controller';

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [InvestorController],
  providers: [ThesisService, ScoringService, MatchService],
  exports: [ThesisService, ScoringService, MatchService],
})
export class InvestorModule {}
