import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  Ip,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { Public } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { PortalService } from './portal.service';
import { SubmissionService } from './submission.service';
import {
  CreatePortalDto,
  UpdatePortalDto,
  GetPortalsQueryDto,
  GetSubmissionsQueryDto,
  SubmitToPortalDto,
} from './dto';
import { extractClientIp } from './utils/submission-canonical';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@Controller('portals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PortalController {
  constructor(
    private portalService: PortalService,
    private submissionService: SubmissionService,
  ) {}

  // ============ PORTAL MANAGEMENT (Authenticated Users) ============

  @Post()
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async create(@CurrentUser() user: User, @Body() dto: CreatePortalDto) {
    return this.portalService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async findAll(@CurrentUser() user: User, @Query() query: GetPortalsQueryDto) {
    return this.portalService.findAll(user.id, query);
  }

  @Get(':id')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.portalService.findOne(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdatePortalDto,
  ) {
    return this.portalService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async delete(@CurrentUser() user: User, @Param('id') id: string) {
    await this.portalService.delete(id, user.id);
    return { success: true, message: 'Portal deleted' };
  }

  @Get(':id/submissions')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async getSubmissions(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: GetSubmissionsQueryDto,
  ) {
    return this.submissionService.findAll(id, user.id, query);
  }

  @Post(':id/submissions/:submissionId/approve')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async approveSubmission(
    @CurrentUser() user: User,
    @Param('id') _id: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissionService.approve(submissionId, user.id);
  }

  @Post(':id/submissions/:submissionId/reject')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async rejectSubmission(
    @CurrentUser() user: User,
    @Param('id') _id: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissionService.reject(submissionId, user.id);
  }

  // ============ ADMIN ABUSE-AUDIT (DS-E1-F7-S1) ============

  /**
   * Read-only view of the public-portal submission audit log. Useful when
   * investigating "is someone spraying our apply link?". `since` accepts an
   * ISO timestamp; defaults to "all time" so an admin can just hit it.
   */
  @Get(':id/submission-audit')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async listSubmissionAudit(
    @CurrentUser() user: User,
    @Param('id') portalId: string,
    @Query('since') sinceRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    // Ensure the caller actually owns this portal (or is admin).
    await this.portalService.findOne(portalId, user.id);
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      throw new HttpException(
        '`since` must be an ISO-8601 timestamp',
        HttpStatus.BAD_REQUEST,
      );
    }
    const limit = limitRaw
      ? Math.min(Math.max(parseInt(limitRaw, 10) || 100, 1), 500)
      : 100;
    return this.submissionService.listAudit(portalId, { since, limit });
  }

  // ============ PUBLIC ENDPOINTS ============

  @Public()
  @Get('apply/:slug')
  async getPortalBySlug(@Param('slug') slug: string) {
    return this.portalService.findBySlug(slug);
  }

  @Public()
  @Post('apply/:slug')
  async submitToPortal(
    @Param('slug') slug: string,
    @Body() dto: SubmitToPortalDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const portalData = await this.portalService.findBySlug(slug);
    const clientIp = extractClientIp({
      ip,
      forwardedFor: req.headers['x-forwarded-for'] ?? null,
    });
    try {
      return await this.submissionService.create(portalData.id, dto, {
        ipAddress: clientIp,
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        const payload = error.getResponse();
        const retryAfter =
          typeof payload === 'object' && payload !== null
            ? (payload as { retryAfterSeconds?: number }).retryAfterSeconds
            : undefined;
        if (retryAfter && Number.isFinite(retryAfter)) {
          res.setHeader('Retry-After', String(retryAfter));
        }
      }
      throw error;
    }
  }
}
