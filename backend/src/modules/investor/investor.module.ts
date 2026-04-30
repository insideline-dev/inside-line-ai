import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { AdminModule } from '../admin';
import { AiModule } from '../ai';
import { StartupModule } from '../startup/startup.module';
import { InvestorOnboardingModule } from './onboarding/investor-onboarding.module';
import { ThesisService } from './thesis.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import { InvestorNoteService } from './investor-note.service';
import { PortfolioService } from './portfolio.service';
import { DealPipelineService } from './deal-pipeline.service';
import { MessagingService } from './messaging.service';
import { ScoringPreferencesService } from './scoring-preferences.service';
import { DealDecisionService } from './deal-decision.service';
import {
  InvestorController,
  InvestorTeamPublicController,
} from './investor.controller';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    AdminModule,
    AiModule,
    StartupModule,
    forwardRef(() => InvestorOnboardingModule),
  ],
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
    DealDecisionService,
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
    DealDecisionService,
  ],
})
export class InvestorModule {}
