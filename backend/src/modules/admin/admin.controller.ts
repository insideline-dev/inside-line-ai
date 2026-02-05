import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { StartupService } from '../startup/startup.service';
import { AnalyticsService } from './analytics.service';
import { UserManagementService } from './user-management.service';
import { ScoringConfigService } from './scoring-config.service';
import { DataImportService } from './data-import.service';
import { QueueManagementService } from './queue-management.service';
import { QUEUE_NAMES, QueueName } from '../../queue';
import {
  GetUsersQueryDto,
  UpdateUserDto,
  UpdateDefaultWeightsDto,
  ExportUsersQueryDto,
  ExportStartupsQueryDto,
  GetStartupStatsQueryDto,
} from './dto';
import { GetStartupsQueryDto } from '../startup/dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private analyticsService: AnalyticsService,
    private userManagementService: UserManagementService,
    private scoringConfigService: ScoringConfigService,
    private dataImportService: DataImportService,
    private queueManagementService: QueueManagementService,
    private startupService: StartupService,
  ) {}

  // ============ ANALYTICS ENDPOINTS ============

  @Get('stats')
  async getStats() {
    return this.analyticsService.getOverview();
  }

  @Get('stats/startups')
  async getStartupStats(@Query() query: GetStartupStatsQueryDto) {
    return this.analyticsService.getStartupStats(query.days);
  }

  @Get('stats/investors')
  async getInvestorStats() {
    return this.analyticsService.getInvestorStats();
  }

  // ============ USER MANAGEMENT ENDPOINTS ============

  @Get('users')
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.userManagementService.findAll(query);
  }

  @Get('users/:id')
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userManagementService.findOne(id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userManagementService.update(id, dto);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string) {
    await this.userManagementService.delete(id);
    return { success: true, message: 'User deleted' };
  }

  @Post('users/:id/impersonate')
  async impersonateUser(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.userManagementService.impersonate(admin.id, id);
  }

  // ============ STARTUP MANAGEMENT ENDPOINTS ============
  // These reuse existing StartupService methods that already have admin logic

  @Get('startups/pending')
  async getPendingStartups(@Query() query: GetStartupsQueryDto) {
    return this.startupService.adminFindPending(query);
  }

  @Post('startups/:id/approve')
  async approveStartup(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.startupService.approve(id, admin.id);
  }

  @Post('startups/:id/reject')
  async rejectStartup(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'Rejection reason must be at least 10 characters',
      );
    }
    return this.startupService.reject(id, admin.id, reason);
  }

  // ============ SCORING CONFIGURATION ENDPOINTS ============

  @Get('scoring/defaults')
  async getScoringDefaults() {
    return this.scoringConfigService.getDefaults();
  }

  @Put('scoring/defaults')
  async updateScoringDefaults(@Body() dto: UpdateDefaultWeightsDto) {
    return this.scoringConfigService.updateDefaults(dto);
  }

  // ============ DATA IMPORT/EXPORT ENDPOINTS ============

  @Post('data/import/users')
  @UseInterceptors(FileInterceptor('file'))
  async importUsers(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    const content = file.buffer.toString('utf-8');
    return this.dataImportService.importUsers(content);
  }

  @Post('data/import/startups')
  @UseInterceptors(FileInterceptor('file'))
  async importStartups(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    if (!file.mimetype.includes('csv') && !file.originalname.endsWith('.csv')) {
      throw new BadRequestException('File must be a CSV');
    }

    const content = file.buffer.toString('utf-8');
    return this.dataImportService.importStartups(content);
  }

  @Get('data/export/users')
  async exportUsers(
    @Query() query: ExportUsersQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.dataImportService.exportUsers(query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=users-${Date.now()}.csv`,
    );
    res.send(csv);
  }

  @Get('data/export/startups')
  async exportStartups(
    @Query() query: ExportStartupsQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.dataImportService.exportStartups(query);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=startups-${Date.now()}.csv`,
    );
    res.send(csv);
  }

  // ============ QUEUE MANAGEMENT ENDPOINTS ============

  @Get('queue/status')
  async getQueueStatus() {
    return this.queueManagementService.getStatus();
  }

  @Post('queue/retry/:jobId')
  async retryJob(
    @Param('jobId') jobId: string,
    @Query('queue') queueName?: string,
  ) {
    const queue = (queueName as QueueName) || QUEUE_NAMES.TASK;
    return this.queueManagementService.retryJob(queue, jobId);
  }

  // ============ LOCATION NORMALIZATION ENDPOINTS ============

  @Post('normalize-locations')
  async normalizeLocations() {
    return this.analyticsService.normalizeLocations();
  }
}
