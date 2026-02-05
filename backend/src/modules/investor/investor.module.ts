import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { QueueModule } from '../../queue';
import { ThesisService } from './thesis.service';
import { ScoringService } from './scoring.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import {
  InvestorController,
  InvestorTeamPublicController,
} from './investor.controller';

@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [InvestorController, InvestorTeamPublicController],
  providers: [ThesisService, ScoringService, MatchService, TeamService],
  exports: [ThesisService, ScoringService, MatchService, TeamService],
})
export class InvestorModule {}
