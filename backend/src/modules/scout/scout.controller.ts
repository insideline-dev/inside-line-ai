import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { ScoutService } from './scout.service';
import { SubmissionService } from './submission.service';
import { CommissionService } from './commission.service';
import { ScoutMetricsService } from './scout-metrics.service';
import { ScoutGuard } from './guards';
import {
  ApplyScoutDto,
  RejectScoutDto,
  ScoutSubmitStartupDto,
  GetApplicationsQueryDto,
  GetSubmissionsQueryDto,
  GetStartupMatchesQueryDto,
  ScoutApplicationsResponseDto,
  ScoutSubmissionsResponseDto,
  ScoutInvestorsResponseDto,
  ScoutSubmitResponseDto,
  ScoutStartupDetailResponseDto,
  ScoutStartupMatchesResponseDto,
  ScoutCommissionsResponseDto,
  ScoutTotalEarningsResponseDto,
  ScoutMetricsResponseDto,
  ScoutLeaderboardResponseDto,
} from './dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@ApiTags('Scout')
@ApiBearerAuth('JWT')
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScoutController {
  constructor(
    private scoutService: ScoutService,
    private submissionService: SubmissionService,
    private commissionService: CommissionService,
    private metricsService: ScoutMetricsService,
  ) {}

  // ============ SCOUT APPLICATION ENDPOINTS ============

  @Get('scout/investors')
  @Roles(UserRole.FOUNDER, UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'List investors available for scout applications' })
  @ApiResponse({ status: 200, type: ScoutInvestorsResponseDto })
  async getInvestors(@CurrentUser() user: User) {
    const investors = await this.scoutService.listInvestors(user.id);
    return { data: investors };
  }

  @Post('scout/apply')
  @Roles(UserRole.FOUNDER, UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Apply to become a scout for a specific investor' })
  @ApiResponse({ status: 201, type: ScoutApplicationsResponseDto })
  async apply(@CurrentUser() user: User, @Body() dto: ApplyScoutDto) {
    const application = await this.scoutService.apply(user.id, dto);
    return {
      data: [application],
      meta: {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
      },
    };
  }

  @Get('scout/applications')
  @Roles(UserRole.FOUNDER, UserRole.INVESTOR, UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scout applications created by current user' })
  @ApiResponse({ status: 200, type: ScoutApplicationsResponseDto })
  async getMyApplications(
    @CurrentUser() user: User,
    @Query() query: GetApplicationsQueryDto,
  ) {
    return this.scoutService.findApplications(user.id, query);
  }

  // ============ SCOUT SUBMISSION ENDPOINTS ============

  @Post('scout/submit')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @UseGuards(ScoutGuard)
  @ApiOperation({ summary: 'Submit startup referral as approved scout' })
  @ApiResponse({ status: 201, type: ScoutSubmitResponseDto })
  async submit(@CurrentUser() user: User, @Body() dto: ScoutSubmitStartupDto) {
    return this.submissionService.submit(user.id, dto);
  }

  @Get('scout/submissions')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get startup referrals submitted by current scout user' })
  @ApiResponse({ status: 200, type: ScoutSubmissionsResponseDto })
  async getMySubmissions(
    @CurrentUser() user: User,
    @Query() query: GetSubmissionsQueryDto,
  ) {
    return this.submissionService.findAll(user.id, query);
  }

  @Get('scout/startups/:startupId')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get details for a startup submitted by the scout' })
  @ApiResponse({ status: 200, type: ScoutStartupDetailResponseDto })
  async getMySubmissionStartup(
    @CurrentUser() user: User,
    @Param('startupId') startupId: string,
  ) {
    return this.submissionService.getStartupDetail(
      user.id,
      startupId,
      user.role === UserRole.ADMIN,
    );
  }

  @Get('scout/startups/:startupId/matches')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get top investor matches for a scout-submitted startup' })
  @ApiResponse({ status: 200, type: ScoutStartupMatchesResponseDto })
  async getMySubmissionMatches(
    @CurrentUser() user: User,
    @Param('startupId') startupId: string,
    @Query() query: GetStartupMatchesQueryDto,
  ) {
    return this.submissionService.getStartupMatches(
      user.id,
      startupId,
      query.limit,
      user.role === UserRole.ADMIN,
    );
  }

  // ============ INVESTOR ENDPOINTS ============

  @Get('investor/scout-applications')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scout applications submitted to the current investor' })
  @ApiResponse({ status: 200, type: ScoutApplicationsResponseDto })
  async getScoutApplications(
    @CurrentUser() user: User,
    @Query() query: GetApplicationsQueryDto,
  ) {
    return this.scoutService.findApplicationsForInvestor(user.id, query);
  }

  @Post('investor/scout-applications/:id/approve')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve a scout application' })
  @ApiResponse({ status: 201, type: ScoutApplicationsResponseDto })
  async approveApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const application = await this.scoutService.approve(id, user.id);
    return {
      data: [application],
      meta: {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
      },
    };
  }

  @Post('investor/scout-applications/:id/reject')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject a scout application' })
  @ApiResponse({ status: 201, type: ScoutApplicationsResponseDto })
  async rejectApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RejectScoutDto,
  ) {
    const application = await this.scoutService.reject(id, user.id, dto);
    return {
      data: [application],
      meta: {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
      },
    };
  }

  @Get('investor/scout-submissions')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get startup referrals submitted to current investor' })
  @ApiResponse({ status: 200, type: ScoutSubmissionsResponseDto })
  async getScoutSubmissions(
    @CurrentUser() user: User,
    @Query() query: GetSubmissionsQueryDto,
  ) {
    return this.submissionService.findAllForInvestor(user.id, query);
  }

  // ============ SCOUT METRICS ENDPOINTS ============

  @Get('scout/commissions')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scout commission records' })
  @ApiResponse({ status: 200, type: ScoutCommissionsResponseDto })
  async getCommissions(@CurrentUser() user: User) {
    return this.commissionService.getCommissions(user.id);
  }

  @Get('scout/commissions/total')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scout commission totals' })
  @ApiResponse({ status: 200, type: ScoutTotalEarningsResponseDto })
  async getTotalEarnings(@CurrentUser() user: User) {
    return this.commissionService.getTotalEarnings(user.id);
  }

  @Get('scout/metrics')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scout activity metrics' })
  @ApiResponse({ status: 200, type: ScoutMetricsResponseDto })
  async getMetrics(@CurrentUser() user: User) {
    return this.metricsService.getMetrics(user.id);
  }

  @Get('scout/leaderboard')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get scout leaderboard' })
  @ApiResponse({ status: 200, type: ScoutLeaderboardResponseDto })
  async getLeaderboard() {
    return this.metricsService.getLeaderboard();
  }
}
