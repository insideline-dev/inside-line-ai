import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq, and, or, ilike, sql, count, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { user, refreshToken, UserRole } from '../../auth/entities/auth.schema';
import { GetUsersQuery, UpdateUser } from './dto';

export interface ImpersonationPayload {
  sub: string;
  email: string;
  impersonatedBy: string;
}

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    private drizzle: DrizzleService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async findAll(query: GetUsersQuery) {
    const { page, limit, role, search } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (role) {
      conditions.push(eq(user.role, role));
    }

    if (search) {
      conditions.push(
        or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`))!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ total }]] = await Promise.all([
      this.drizzle.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified,
          image: user.image,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })
        .from(user)
        .where(whereClause)
        .orderBy(desc(user.createdAt))
        .limit(limit)
        .offset(offset),
      this.drizzle.db
        .select({ total: count() })
        .from(user)
        .where(whereClause),
    ]);

    return {
      data: items,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async findOne(id: string) {
    const [found] = await this.drizzle.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return found;
  }

  async update(id: string, dto: UpdateUser) {
    const existing = await this.findOne(id);

    // Prevent removing the last admin
    if (
      dto.role === UserRole.USER &&
      existing.role === UserRole.ADMIN
    ) {
      const adminCount = await this.drizzle.db
        .select({ count: count() })
        .from(user)
        .where(eq(user.role, UserRole.ADMIN));

      if (Number(adminCount[0]?.count) <= 1) {
        throw new BadRequestException('Cannot remove the last admin');
      }
    }

    const [updated] = await this.drizzle.db
      .update(user)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(user.id, id))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

    this.logger.log(`Updated user ${id}`);
    return updated;
  }

  async delete(id: string) {
    const existing = await this.findOne(id);

    // Prevent deleting the last admin
    if (existing.role === UserRole.ADMIN) {
      const adminCount = await this.drizzle.db
        .select({ count: count() })
        .from(user)
        .where(eq(user.role, UserRole.ADMIN));

      if (Number(adminCount[0]?.count) <= 1) {
        throw new BadRequestException('Cannot delete the last admin');
      }
    }

    // Revoke all refresh tokens for this user
    await this.drizzle.db
      .delete(refreshToken)
      .where(eq(refreshToken.userId, id));

    // Soft delete - in real implementation, you'd have a deletedAt column
    // For now, we'll do a hard delete since we don't have that column
    await this.drizzle.db.delete(user).where(eq(user.id, id));

    this.logger.log(`Deleted user ${id}`);
  }

  async impersonate(adminId: string, targetUserId: string) {
    const target = await this.findOne(targetUserId);
    const admin = await this.findOne(adminId);

    // Admins can impersonate any user except other admins
    if (target.role === UserRole.ADMIN && adminId !== targetUserId) {
      throw new BadRequestException('Cannot impersonate another admin');
    }

    const payload: ImpersonationPayload = {
      sub: target.id,
      email: target.email,
      impersonatedBy: adminId,
    };

    // Short-lived token (15 minutes)
    const token = this.jwt.sign(payload, { expiresIn: '15m' });

    this.logger.warn(
      `Admin ${admin.email} impersonating user ${target.email}`,
    );

    return {
      accessToken: token,
      expiresIn: 900, // 15 minutes in seconds
      targetUser: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
      },
    };
  }

  async getRoleDistribution() {
    const result = await this.drizzle.db
      .select({ role: user.role, count: count() })
      .from(user)
      .groupBy(user.role);

    const distribution: Record<string, number> = {};
    result.forEach((r) => {
      distribution[r.role] = Number(r.count);
    });

    return distribution;
  }
}
