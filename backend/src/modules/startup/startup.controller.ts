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
import { UserRole } from '../../auth/entities/auth.schema';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};
import { StartupService } from './startup.service';
import { DraftService } from './draft.service';
import { RolesGuard } from './guards';
import { Roles } from './decorators/roles.decorator';
import {
  CreateStartupDto,
  UpdateStartupDto,
  SubmitStartupDto,
  ApproveStartupDto,
  RejectStartupDto,
  SaveDraftDto,
  PresignedUrlDto,
  GetStartupsQueryDto,
  GetApprovedStartupsQueryDto,
} from './dto';
import { Public } from '../../auth/decorators';

@Controller('startups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StartupController {
  constructor(
    private startupService: StartupService,
    private draftService: DraftService,
  ) {}

  // ============ FOUNDER ENDPOINTS ============

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  async create(@CurrentUser() user: User, @Body() dto: CreateStartupDto) {
    return this.startupService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.USER, UserRole.ADMIN)
  async findAll(@CurrentUser() user: User, @Query() query: GetStartupsQueryDto) {
    return this.startupService.findAll(user.id, query);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.startupService.findOne(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateStartupDto,
  ) {
    return this.startupService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async delete(@CurrentUser() user: User, @Param('id') id: string) {
    await this.startupService.delete(id, user.id);
    return { success: true, message: 'Startup deleted' };
  }

  @Post(':id/submit')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async submit(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() _dto: SubmitStartupDto,
  ) {
    return this.startupService.submit(id, user.id);
  }

  @Post(':id/resubmit')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async resubmit(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() _dto: SubmitStartupDto,
  ) {
    return this.startupService.resubmit(id, user.id);
  }

  @Get(':id/jobs')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async getJobs(@CurrentUser() user: User, @Param('id') id: string) {
    return this.startupService.getJobs(id, user.id);
  }

  @Post(':id/upload-url')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async getUploadUrl(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: PresignedUrlDto,
  ) {
    return this.startupService.getUploadUrl(id, user.id, dto);
  }

  @Post(':id/draft')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async saveDraft(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.draftService.save(id, user.id, dto);
  }

  @Get(':id/draft')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async getDraft(@CurrentUser() user: User, @Param('id') id: string) {
    return this.draftService.get(id, user.id);
  }

  // ============ INVESTOR ENDPOINTS ============

  @Get('approved/list')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async findApproved(
    @CurrentUser() _user: User,
    @Query() query: GetApprovedStartupsQueryDto,
  ) {
    return this.startupService.findApproved(query);
  }

  @Get('approved/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  async findApprovedById(@CurrentUser() _user: User, @Param('id') id: string) {
    return this.startupService.findApprovedById(id);
  }

  // ============ ADMIN ENDPOINTS ============

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  async adminFindAll(
    @CurrentUser() _user: User,
    @Query() query: GetStartupsQueryDto,
  ) {
    return this.startupService.adminFindAll(query);
  }

  @Get('admin/pending')
  @Roles(UserRole.ADMIN)
  async adminFindPending(
    @CurrentUser() _user: User,
    @Query() query: GetStartupsQueryDto,
  ) {
    return this.startupService.adminFindPending(query);
  }

  @Post('admin/:id/approve')
  @Roles(UserRole.ADMIN)
  async approve(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() _dto: ApproveStartupDto,
  ) {
    return this.startupService.approve(id, user.id);
  }

  @Post('admin/:id/reject')
  @Roles(UserRole.ADMIN)
  async reject(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RejectStartupDto,
  ) {
    return this.startupService.reject(id, user.id, dto.rejectionReason);
  }

  @Post('admin/:id/reanalyze')
  @Roles(UserRole.ADMIN)
  async reanalyze(@CurrentUser() user: User, @Param('id') id: string) {
    return this.startupService.reanalyze(id, user.id);
  }

  @Patch('admin/:id')
  @Roles(UserRole.ADMIN)
  async adminUpdate(@Param('id') id: string, @Body() dto: UpdateStartupDto) {
    return this.startupService.adminUpdate(id, dto);
  }

  @Delete('admin/:id')
  @Roles(UserRole.ADMIN)
  async adminDelete(@Param('id') id: string) {
    await this.startupService.adminDelete(id);
    return { success: true, message: 'Startup deleted' };
  }

  // ============ PUBLIC ENDPOINTS ============

  @Public()
  @Get('public/:slug')
  async findBySlug(@Param('slug') slug: string) {
    return this.startupService.findBySlug(slug);
  }
}
