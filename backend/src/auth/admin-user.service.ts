import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq, count, desc } from 'drizzle-orm';
import { DrizzleService } from '../database';
import { user, roleAudit } from '../database/schema';
import type { DbUser } from './user-auth.service';
import { UserRole } from './entities/auth.schema';

export type { UserRole };

/**
 * AdminUserService
 * SECURITY: This service handles all privileged user management operations
 * Only admins can call these methods. Role changes are logged for audit.
 */
@Injectable()
export class AdminUserService {
  constructor(private drizzle: DrizzleService) {}

  /**
   * Promote a user to admin
   * SECURITY: Only admins can call this. Prevents last admin demotion.
   */
  async promoteUserToAdmin(
    targetUserId: string,
    adminUser: DbUser,
    reason?: string,
  ): Promise<DbUser> {
    // SECURITY: Verify caller is admin
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can promote users');
    }

    // SECURITY: Don't allow self-promotion (already admin)
    if (targetUserId === adminUser.id) {
      throw new BadRequestException('Admin cannot re-promote themselves');
    }

    const targetUser = await this.findUserById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // SECURITY: Check if already admin
    if (targetUser.role === UserRole.ADMIN) {
      throw new ConflictException('User is already an admin');
    }

    // Update role
    const [updated] = await this.drizzle.db
      .update(user)
      .set({ role: UserRole.ADMIN })
      .where(eq(user.id, targetUserId))
      .returning();

    if (!updated) {
      throw new Error('Failed to promote user');
    }

    // Log the change
    await this.logRoleChange(
      targetUserId,
      adminUser.id,
      UserRole.USER,
      UserRole.ADMIN,
      reason || 'Admin promoted via API',
    );

    return updated;
  }

  /**
   * Demote an admin to regular user
   * SECURITY: Only admins can call this. Prevents last admin demotion.
   */
  async demoteAdminToUser(
    targetUserId: string,
    adminUser: DbUser,
    reason?: string,
  ): Promise<DbUser> {
    // SECURITY: Verify caller is admin
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can demote other admins');
    }

    // SECURITY: Admins cannot demote themselves
    if (targetUserId === adminUser.id) {
      throw new BadRequestException('Admin cannot demote themselves');
    }

    const targetUser = await this.findUserById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // SECURITY: Check if user is actually an admin
    if (targetUser.role !== UserRole.ADMIN) {
      throw new ConflictException('User is not an admin');
    }

    // SECURITY: Prevent demotion of last admin
    const adminCount = await this.countAdmins();
    if (adminCount <= 1) {
      throw new BadRequestException(
        'Cannot demote the last admin. You must promote another user first.',
      );
    }

    // Update role
    const [updated] = await this.drizzle.db
      .update(user)
      .set({ role: UserRole.USER })
      .where(eq(user.id, targetUserId))
      .returning();

    if (!updated) {
      throw new Error('Failed to demote admin');
    }

    // Log the change
    await this.logRoleChange(
      targetUserId,
      adminUser.id,
      UserRole.ADMIN,
      UserRole.USER,
      reason || 'Admin demoted via API',
    );

    return updated;
  }

  /**
   * Get role audit history
   * SECURITY: Only admins can view audit logs
   */
  async getRoleAuditHistory(
    adminUser: DbUser,
    targetUserId?: string,
    limit: number = 100,
  ) {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can view audit logs');
    }

    return this.drizzle.db
      .select()
      .from(roleAudit)
      .where(
        targetUserId ? eq(roleAudit.targetUserId, targetUserId) : undefined,
      )
      .orderBy(desc(roleAudit.createdAt))
      .limit(limit);
  }

  /**
   * List all admins
   * SECURITY: Only admins can view the admin list
   */
  async listAdmins(adminUser: DbUser) {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can view admin list');
    }

    return this.drizzle.db
      .select()
      .from(user)
      .where(eq(user.role, UserRole.ADMIN));
  }

  /**
   * Private helpers
   */

  private async findUserById(id: string): Promise<DbUser | undefined> {
    const [found] = await this.drizzle.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return found;
  }

  private async countAdmins(): Promise<number> {
    const [result] = await this.drizzle.db
      .select({ count: count() })
      .from(user)
      .where(eq(user.role, UserRole.ADMIN));
    return result.count;
  }

  private async logRoleChange(
    targetUserId: string,
    adminUserId: string,
    oldRole: UserRole,
    newRole: UserRole,
    reason: string,
  ) {
    await this.drizzle.db.insert(roleAudit).values({
      targetUserId,
      adminUserId,
      oldRole,
      newRole,
      reason,
    });
  }
}
