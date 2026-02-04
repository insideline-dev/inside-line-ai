import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminUserService } from './admin-user.service';
import { CurrentUser } from './decorators';
import type { DbUser } from './user-auth.service';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserRole } from './entities/auth.schema';

/**
 * Admin DTOs - for role management operations
 * SECURITY: These DTOs explicitly exclude sensitive fields from user input
 */

const PromoteUserSchema = z.object({
  userId: z.uuid(),
  reason: z.string().max(500).optional(),
});
class PromoteUserDto extends createZodDto(PromoteUserSchema) {}

const DemoteAdminSchema = z.object({
  adminId: z.uuid(),
  reason: z.string().max(500).optional(),
});
class DemoteAdminDto extends createZodDto(DemoteAdminSchema) {}

const AdminResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
  createdAt: z.iso.datetime(),
});
class AdminResponseDto extends createZodDto(AdminResponseSchema) {}

/**
 * AdminController
 * SECURITY: All endpoints require admin authentication
 * All role changes are logged to roleAudit table for compliance
 */
@ApiTags('admin')
@Controller('admin')
@ApiBearerAuth('JWT')
@ApiForbiddenResponse({ description: 'Admin access required' })
export class AdminController {
  constructor(private adminUserService: AdminUserService) {}

  /**
   * Promote a user to admin
   * SECURITY: Only admins can perform this action. Changes are audited.
   */
  @Post('promote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Promote user to admin',
    description:
      'SECURITY: Only admins can promote users. All changes are logged.',
  })
  @ApiResponse({ status: 200, type: AdminResponseDto })
  @ApiBadRequestResponse({
    description: 'User already admin or invalid request',
  })
  async promoteUser(
    @Body() dto: PromoteUserDto,
    @CurrentUser() adminUser: DbUser,
  ) {
    const promoted = await this.adminUserService.promoteUserToAdmin(
      dto.userId,
      adminUser,
      dto.reason,
    );

    return this.sanitizeUser(promoted);
  }

  /**
   * Demote an admin to regular user
   * SECURITY: Prevents demotion of last admin. Changes are audited.
   */
  @Post('demote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Demote admin to user',
    description:
      'SECURITY: Only admins can demote other admins. Cannot demote last admin.',
  })
  @ApiResponse({ status: 200, type: AdminResponseDto })
  @ApiBadRequestResponse({
    description:
      'Cannot demote last admin or user not found or invalid request',
  })
  async demoteAdmin(
    @Body() dto: DemoteAdminDto,
    @CurrentUser() adminUser: DbUser,
  ) {
    const demoted = await this.adminUserService.demoteAdminToUser(
      dto.adminId,
      adminUser,
      dto.reason,
    );

    return this.sanitizeUser(demoted);
  }

  /**
   * List all admins
   * SECURITY: Only admins can view admin list
   */
  @Get('admins')
  @ApiOperation({
    summary: 'List all admins',
    description: 'SECURITY: Only admins can view the admin list.',
  })
  @ApiResponse({ status: 200, type: [AdminResponseDto] })
  async listAdmins(@CurrentUser() adminUser: DbUser) {
    const admins = await this.adminUserService.listAdmins(adminUser);
    return admins.map((a) => this.sanitizeUser(a));
  }

  /**
   * Get role audit history
   * SECURITY: Only admins can view audit logs. Shows all role changes.
   */
  @Get('audit/roles')
  @ApiOperation({
    summary: 'View role change audit log',
    description:
      'SECURITY: Only admins can view. Shows all role changes with who changed what when.',
  })
  @ApiResponse({ status: 200 })
  async getRoleAuditLog(@CurrentUser() adminUser: DbUser, @Req() req: Request) {
    const targetUserId = req.query.userId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

    if (targetUserId && !this.isValidUuid(targetUserId)) {
      throw new BadRequestException('Invalid userId format');
    }

    return this.adminUserService.getRoleAuditHistory(
      adminUser,
      targetUserId,
      limit,
    );
  }

  /**
   * Helpers
   */

  private sanitizeUser(u: DbUser) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role as UserRole,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private isValidUuid(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
