import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { ThesisService } from './thesis.service';
import { ScoringService } from './scoring.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import { InvestorNoteService } from './investor-note.service';
import { PortfolioService } from './portfolio.service';
import { DealPipelineService } from './deal-pipeline.service';
import { MessagingService } from './messaging.service';
import {
  InvestorController,
  InvestorTeamPublicController,
} from './investor.controller';

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [InvestorController, InvestorTeamPublicController],
  providers: [
    ThesisService,
    ScoringService,
    MatchService,
    TeamService,
    InvestorNoteService,
    PortfolioService,
    DealPipelineService,
    MessagingService,
  ],
  exports: [
    ThesisService,
    ScoringService,
    MatchService,
    TeamService,
    InvestorNoteService,
    PortfolioService,
    DealPipelineService,
    MessagingService,
  ],
})
export class InvestorModule {}
