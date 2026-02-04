import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  @Roles(UserRole.USER, UserRole.ADMIN)
  async create(@CurrentUser() user: User, @Body() dto: CreatePortalDto) {
    return this.portalService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  async findAll(@CurrentUser() user: User, @Query() query: GetPortalsQueryDto) {
    return this.portalService.findAll(user.id, query);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.portalService.findOne(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdatePortalDto,
  ) {
    return this.portalService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async delete(@CurrentUser() user: User, @Param('id') id: string) {
    await this.portalService.delete(id, user.id);
    return { success: true, message: 'Portal deleted' };
  }

  @Get(':id/submissions')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async getSubmissions(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Query() query: GetSubmissionsQueryDto,
  ) {
    return this.submissionService.findAll(id, user.id, query);
  }

  @Post(':id/submissions/:submissionId/approve')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async approveSubmission(
    @CurrentUser() user: User,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissionService.approve(submissionId, user.id);
  }

  @Post(':id/submissions/:submissionId/reject')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async rejectSubmission(
    @CurrentUser() user: User,
    @Param('submissionId') submissionId: string,
  ) {
    return this.submissionService.reject(submissionId, user.id);
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
  ) {
    const portalData = await this.portalService.findBySlug(slug);
    return this.submissionService.create(portalData.id, dto);
  }
}
