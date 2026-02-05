import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { ThesisService } from './thesis.service';
import { ScoringService } from './scoring.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import {
  CreateThesisDto,
  UpdateThesisDto,
  UpdateScoringWeightsDto,
  GetMatchesQueryDto,
  CreateTeamInviteDto,
} from './dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@Controller('investor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INVESTOR, UserRole.ADMIN)
export class InvestorController {
  constructor(
    private thesisService: ThesisService,
    private scoringService: ScoringService,
    private matchService: MatchService,
    private teamService: TeamService,
  ) {}

  // ============ THESIS ENDPOINTS ============

  @Get('thesis')
  async getThesis(@CurrentUser() user: User) {
    return this.thesisService.findOne(user.id);
  }

  @Post('thesis')
  async createOrUpdateThesis(
    @CurrentUser() user: User,
    @Body() dto: CreateThesisDto,
  ) {
    const thesis = await this.thesisService.upsert(user.id, dto);
    await this.matchService.regenerateMatches(user.id);
    return thesis;
  }

  @Delete('thesis')
  async deleteThesis(@CurrentUser() user: User) {
    await this.thesisService.delete(user.id);
    return { success: true, message: 'Thesis deleted' };
  }

  // ============ SCORING ENDPOINTS ============

  @Get('scoring')
  async getScoringWeights(@CurrentUser() user: User) {
    return this.scoringService.findOne(user.id);
  }

  @Put('scoring')
  async updateScoringWeights(
    @CurrentUser() user: User,
    @Body() dto: UpdateScoringWeightsDto,
  ) {
    const weights = await this.scoringService.update(user.id, dto);
    await this.matchService.regenerateMatches(user.id);
    return weights;
  }

  // ============ MATCHES ENDPOINTS ============

  @Get('matches')
  async getMatches(
    @CurrentUser() user: User,
    @Query() query: GetMatchesQueryDto,
  ) {
    return this.matchService.findAll(user.id, query);
  }

  @Get('matches/:startupId')
  async getMatchDetails(
    @CurrentUser() user: User,
    @Param('startupId') startupId: string,
  ) {
    const match = await this.matchService.findOne(user.id, startupId);
    await this.matchService.updateViewedAt(user.id, startupId);
    return match;
  }

  @Patch('matches/:startupId/save')
  async toggleSaved(
    @CurrentUser() user: User,
    @Param('startupId') startupId: string,
  ) {
    return this.matchService.toggleSaved(user.id, startupId);
  }

  // ============ TEAM ENDPOINTS ============

  @Get('team')
  async getTeam(@CurrentUser() user: User) {
    return this.teamService.getTeam(user.id);
  }

  @Post('team/invite')
  async createTeamInvite(
    @CurrentUser() user: User,
    @Body() dto: CreateTeamInviteDto,
  ) {
    return this.teamService.createInvite(user.id, dto);
  }

  @Delete('team/invite/:id')
  async cancelInvite(@CurrentUser() user: User, @Param('id') inviteId: string) {
    await this.teamService.cancelInvite(user.id, inviteId);
    return { success: true, message: 'Invite cancelled' };
  }

  @Delete('team/member/:id')
  async removeMember(@CurrentUser() user: User, @Param('id') memberId: string) {
    await this.teamService.removeMember(user.id, memberId);
    return { success: true, message: 'Member removed' };
  }
}

// ============================================================================
// PUBLIC ENDPOINTS (No RolesGuard)
// ============================================================================

@Controller('investor/team')
@UseGuards(JwtAuthGuard)
export class InvestorTeamPublicController {
  constructor(private teamService: TeamService) {}

  @Post('join/:inviteCode')
  async acceptInvite(
    @CurrentUser() user: User,
    @Param('inviteCode') inviteCode: string,
  ) {
    return this.teamService.acceptInvite(user.id, inviteCode);
  }
}
