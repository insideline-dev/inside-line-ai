import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { AdminModule } from '../admin';
import { ThesisService } from './thesis.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import { InvestorNoteService } from './investor-note.service';
import { PortfolioService } from './portfolio.service';
import { DealPipelineService } from './deal-pipeline.service';
import { MessagingService } from './messaging.service';
import { ScoringPreferencesService } from './scoring-preferences.service';
import {
  InvestorController,
  InvestorTeamPublicController,
} from './investor.controller';

@Module({
  imports: [DatabaseModule, QueueModule, AdminModule],
  controllers: [InvestorController, InvestorTeamPublicController],
  providers: [
    ThesisService,
    MatchService,
    TeamService,
    InvestorNoteService,
    PortfolioService,
    DealPipelineService,
    MessagingService,
    ScoringPreferencesService,
  ],
  exports: [
    ThesisService,
    MatchService,
    TeamService,
    InvestorNoteService,
    PortfolioService,
    DealPipelineService,
    MessagingService,
    ScoringPreferencesService,
  ],
})
export class InvestorModule {}
