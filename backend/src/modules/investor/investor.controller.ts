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
import {
  CreateThesisDto,
  UpdateThesisDto,
  UpdateScoringWeightsDto,
  GetMatchesQueryDto,
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
@Roles(UserRole.USER, UserRole.ADMIN)
export class InvestorController {
  constructor(
    private thesisService: ThesisService,
    private scoringService: ScoringService,
    private matchService: MatchService,
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
}
