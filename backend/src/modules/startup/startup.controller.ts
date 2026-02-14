import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Header,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
import { PdfService } from './pdf.service';
import { DataRoomService } from './data-room.service';
import { InvestorInterestService } from './investor-interest.service';
import { MeetingService } from './meeting.service';
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
  GetProgressResponseDto,
  UploadDataRoomDto,
  UpdateDataRoomPermissionsDto,
  RespondInterestDto,
  ScheduleMeetingDto,
} from './dto';
import { Public } from '../../auth/decorators';

@Controller('startups')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Startups')
@ApiBearerAuth('JWT')
export class StartupController {
  constructor(
    private startupService: StartupService,
    private draftService: DraftService,
    private pdfService: PdfService,
    private dataRoomService: DataRoomService,
    private interestService: InvestorInterestService,
    private meetingService: MeetingService,
  ) {}

  // ============ FOUNDER ENDPOINTS ============

  @Post()
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async create(@CurrentUser() user: User, @Body() dto: CreateStartupDto) {
    return this.startupService.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.FOUNDER, UserRole.INVESTOR, UserRole.ADMIN)
  async findAll(@CurrentUser() user: User, @Query() query: GetStartupsQueryDto) {
    return this.startupService.findAll(user.id, query);
  }

  @Get(':id')
  @Roles(UserRole.FOUNDER, UserRole.INVESTOR, UserRole.ADMIN)
  async findOne(@CurrentUser() user: User, @Param('id') id: string) {
    if (user.role === UserRole.ADMIN) {
      return this.startupService.adminFindOne(id);
    }

    return this.startupService.findOne(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateStartupDto,
  ) {
    return this.startupService.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async delete(@CurrentUser() user: User, @Param('id') id: string) {
    await this.startupService.delete(id, user.id);
    return { success: true, message: 'Startup deleted' };
  }

  @Post(':id/submit')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async submit(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() _dto: SubmitStartupDto,
  ) {
    return this.startupService.submit(id, user.id);
  }

  @Post(':id/resubmit')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async resubmit(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() _dto: SubmitStartupDto,
  ) {
    return this.startupService.resubmit(id, user.id);
  }

  @Get(':id/jobs')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async getJobs(@CurrentUser() user: User, @Param('id') id: string) {
    return this.startupService.getJobs(id, user.id);
  }

  @Post(':id/upload-url')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async getUploadUrl(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: PresignedUrlDto,
  ) {
    return this.startupService.getUploadUrl(id, user.id, dto);
  }

  @Post(':id/draft')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async saveDraft(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.draftService.save(id, user.id, dto);
  }

  @Get(':id/draft')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async getDraft(@CurrentUser() user: User, @Param('id') id: string) {
    return this.draftService.get(id, user.id);
  }

  @Get(':id/progress')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get startup analysis progress' })
  @ApiResponse({ status: 200, type: GetProgressResponseDto })
  async getProgress(@CurrentUser() user: User, @Param('id') id: string) {
    if (user.role === UserRole.ADMIN) {
      return this.startupService.adminGetProgress(id);
    }

    return this.startupService.getProgress(id, user.id);
  }

  @Get(':id/memo.pdf')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  @Header('Content-Type', 'application/pdf')
  async downloadMemo(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateMemo(id, user.id);
    res.set({
      'Content-Disposition': `attachment; filename="${id}-memo.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get(':id/report.pdf')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  @Header('Content-Type', 'application/pdf')
  async downloadReport(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateReport(id, user.id);
    res.set({
      'Content-Disposition': `attachment; filename="${id}-report.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ============ FOUNDER DATA ROOM & MEETINGS ============

  @Post(':id/data-room')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadToDataRoom(
    @CurrentUser() user: User,
    @Param('id') startupId: string,
    @Body() dto: UploadDataRoomDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (file) {
      return this.dataRoomService.uploadFile(startupId, user.id, file, dto.category);
    }

    if (dto.assetId) {
      return this.dataRoomService.uploadDocument(startupId, dto.assetId, dto.category);
    }

    throw new BadRequestException('File or assetId is required');
  }

  @Get(':id/data-room')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async getDataRoom(@Param('id') startupId: string) {
    return this.dataRoomService.getDocuments(startupId);
  }

  @Patch(':id/data-room/:docId/permissions')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async updateDataRoomPermissions(
    @Param('id') _id: string,
    @Param('docId') docId: string,
    @Body() dto: UpdateDataRoomPermissionsDto,
  ) {
    return this.dataRoomService.updatePermissions(docId, dto.investorIds);
  }

  @Delete(':id/data-room/:docId')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async deleteDataRoomDocument(@Param('id') _id: string, @Param('docId') docId: string) {
    await this.dataRoomService.deleteDocument(docId);
    return { success: true, message: 'Document deleted' };
  }

  @Get(':id/interest')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async getInvestorInterest(@Param('id') startupId: string) {
    return this.interestService.getInterest(startupId);
  }

  @Post(':id/interest/:interestId/respond')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async respondToInterest(
    @Param('id') _id: string,
    @Param('interestId') interestId: string,
    @Body() dto: RespondInterestDto,
  ) {
    return this.interestService.respondToInterest(interestId, dto.response);
  }

  @Post(':id/meetings')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async scheduleMeeting(
    @Param('id') startupId: string,
    @Body() dto: ScheduleMeetingDto,
  ) {
    return this.meetingService.scheduleMeeting(startupId, dto);
  }

  @Get(':id/meetings')
  @Roles(UserRole.FOUNDER, UserRole.ADMIN)
  async getMeetings(@Param('id') startupId: string) {
    return this.meetingService.getMeetings(startupId);
  }

  // ============ INVESTOR ENDPOINTS ============

  @Get('approved/list')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async findApproved(
    @CurrentUser() _user: User,
    @Query() query: GetApprovedStartupsQueryDto,
  ) {
    return this.startupService.findApproved(query);
  }

  @Get('approved/:id')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async findApprovedById(@CurrentUser() _user: User, @Param('id') id: string) {
    return this.startupService.findApprovedById(id);
  }

  @Get('approved/:id/evaluation')
  @Roles(UserRole.INVESTOR, UserRole.ADMIN)
  async getEvaluation(@CurrentUser() _user: User, @Param('id') id: string) {
    return this.startupService.getEvaluation(id);
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
