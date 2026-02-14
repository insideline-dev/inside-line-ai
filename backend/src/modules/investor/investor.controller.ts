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
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { StartupStage } from '../startup/entities/startup.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { ThesisService } from './thesis.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import { InvestorNoteService } from './investor-note.service';
import { PortfolioService } from './portfolio.service';
import { DealPipelineService } from './deal-pipeline.service';
import { MessagingService } from './messaging.service';
import { ScoringPreferencesService } from './scoring-preferences.service';
import {
  CreateThesisDto,
  UpdateThesisDto,
  GetMatchesQueryDto,
  CreateTeamInviteDto,
  CreateNoteDto,
  UpdateNoteDto,
  AddPortfolioDto,
  UpdateMatchStatusDto,
  UpdateScoringPreferencesDto,
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
    private matchService: MatchService,
    private teamService: TeamService,
    private noteService: InvestorNoteService,
    private portfolioService: PortfolioService,
    private pipelineService: DealPipelineService,
    private messagingService: MessagingService,
    private scoringPreferencesService: ScoringPreferencesService,
  ) {}

  // ============ THESIS ENDPOINTS ============

  @Get('geography-taxonomy')
  getGeographyTaxonomy() {
    return this.thesisService.getGeographyTaxonomy();
  }

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

  @Patch('matches/:matchId/status')
  async updateMatchStatus(
    @CurrentUser() user: User,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchStatusDto,
  ) {
    return this.matchService.updateMatchStatus(user.id, matchId, dto);
  }

  // ============ NOTES ENDPOINTS ============

  @Post('notes')
  async createNote(@CurrentUser() user: User, @Body() dto: CreateNoteDto) {
    return this.noteService.create(user.id, dto);
  }

  @Get('notes')
  async getAllNotes(@CurrentUser() user: User) {
    return this.noteService.getAllNotes(user.id);
  }

  @Get('notes/:startupId')
  async getNotes(@CurrentUser() user: User, @Param('startupId') startupId: string) {
    return this.noteService.getNotes(user.id, startupId);
  }

  @Patch('notes/:noteId')
  async updateNote(
    @CurrentUser() user: User,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.noteService.update(noteId, user.id, dto);
  }

  @Delete('notes/:noteId')
  async deleteNote(@CurrentUser() user: User, @Param('noteId') noteId: string) {
    await this.noteService.delete(noteId, user.id);
    return { success: true, message: 'Note deleted' };
  }

  // ============ PORTFOLIO ENDPOINTS ============

  @Post('portfolio')
  async addToPortfolio(@CurrentUser() user: User, @Body() dto: AddPortfolioDto) {
    return this.portfolioService.addToPortfolio(user.id, dto);
  }

  @Get('portfolio')
  async getPortfolio(@CurrentUser() user: User) {
    return this.portfolioService.getPortfolio(user.id);
  }

  // ============ PIPELINE ENDPOINTS ============

  @Get('pipeline')
  async getPipeline(@CurrentUser() user: User) {
    return this.pipelineService.getPipeline(user.id);
  }

  // ============================================================================
  // AI PLACEHOLDERS
  // ============================================================================

  // AI_PLACEHOLDER
  @Get('messaging/conversations')
  async getConversations() {
    return this.messagingService.getConversations();
  }

  // ============ SCORING PREFERENCES ENDPOINTS ============

  @Get('scoring/preferences')
  async getScoringPreferences(@CurrentUser() user: User) {
    return this.scoringPreferencesService.getAll(user.id);
  }

  @Get('scoring/preferences/:stage')
  async getScoringPreferenceByStage(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
  ) {
    const pref = await this.scoringPreferencesService.getByStage(user.id, stage);
    if (!pref) {
      throw new NotFoundException(`No scoring preference found for stage ${stage}`);
    }
    return pref;
  }

  @Get('scoring/effective/:stage')
  async getEffectiveWeights(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
  ) {
    return this.scoringPreferencesService.getEffectiveWeights(user.id, stage);
  }

  @Put('scoring/preferences/:stage')
  async updateScoringPreference(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
    @Body() dto: UpdateScoringPreferencesDto,
  ) {
    return this.scoringPreferencesService.upsert(user.id, stage, dto);
  }

  @Delete('scoring/preferences/:stage')
  async resetScoringPreference(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
  ) {
    await this.scoringPreferencesService.reset(user.id, stage);
    return { success: true, message: 'Scoring preference reset to defaults' };
  }

  @Delete('scoring/preferences')
  async resetAllScoringPreferences(@CurrentUser() user: User) {
    await this.scoringPreferencesService.resetAll(user.id);
    return { success: true, message: 'All scoring preferences reset to defaults' };
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
