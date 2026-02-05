import {
  Controller,
  Get,
  Post,
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
} from './dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

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

  @Post('scout/apply')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async apply(@CurrentUser() user: User, @Body() dto: ApplyScoutDto) {
    return this.scoutService.apply(user.id, dto);
  }

  @Get('scout/applications')
  @Roles(UserRole.FOUNDER, UserRole.INVESTOR, UserRole.SCOUT, UserRole.ADMIN)
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
  async submit(@CurrentUser() user: User, @Body() dto: ScoutSubmitStartupDto) {
    return this.submissionService.submit(user.id, dto);
  }

  @Get('scout/submissions')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  async getMySubmissions(
    @CurrentUser() user: User,
    @Query() query: GetSubmissionsQueryDto,
  ) {
    return this.submissionService.findAll(user.id, query);
  }

  // ============ INVESTOR ENDPOINTS ============

  @Get('investor/scout-applications')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async getScoutApplications(
    @CurrentUser() user: User,
    @Query() query: GetApplicationsQueryDto,
  ) {
    return this.scoutService.findApplicationsForInvestor(user.id, query);
  }

  @Post('investor/scout-applications/:id/approve')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async approveApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.scoutService.approve(id, user.id);
  }

  @Post('investor/scout-applications/:id/reject')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async rejectApplication(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RejectScoutDto,
  ) {
    return this.scoutService.reject(id, user.id, dto);
  }

  @Get('investor/scout-submissions')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async getScoutSubmissions(
    @CurrentUser() user: User,
    @Query() query: GetSubmissionsQueryDto,
  ) {
    return this.submissionService.findAllForInvestor(user.id, query);
  }

  // ============ SCOUT METRICS ENDPOINTS ============

  @Get('scout/commissions')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  async getCommissions(@CurrentUser() user: User) {
    return this.commissionService.getCommissions(user.id);
  }

  @Get('scout/commissions/total')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  async getTotalEarnings(@CurrentUser() user: User) {
    return this.commissionService.getTotalEarnings(user.id);
  }

  @Get('scout/metrics')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  async getMetrics(@CurrentUser() user: User) {
    return this.metricsService.getMetrics(user.id);
  }

  @Get('scout/leaderboard')
  @Roles(UserRole.SCOUT, UserRole.ADMIN)
  async getLeaderboard() {
    return this.metricsService.getLeaderboard();
  }
}
