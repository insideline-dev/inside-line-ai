import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { eq, and, desc, count as drizzleCount } from 'drizzle-orm';
import { DrizzleService } from '../database';
import { notification, Notification, NewNotification, NotificationType } from './entities';
import type { GetNotificationsQuery } from './dto';
import type { NotificationGateway } from './notification.gateway';

export type PaginatedNotifications = {
  data: Notification[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private gateway: NotificationGateway | null = null;

  constructor(
    private drizzle: DrizzleService,
    private moduleRef: ModuleRef,
  ) {}

  async create(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
    link?: string,
  ): Promise<Notification> {
    const [newNotification] = await this.drizzle.db
      .insert(notification)
      .values({
        userId,
        title,
        message,
        type,
        link,
      })
      .returning();

    this.logger.log(`Notification created for user ${userId}: ${title}`);
    return newNotification;
  }

  async createBulk(notifications: NewNotification[]): Promise<Notification[]> {
    if (notifications.length === 0) return [];

    const created = await this.drizzle.db
      .insert(notification)
      .values(notifications)
      .returning();

    this.logger.log(`Created ${created.length} notifications`);
    return created;
  }

  async createAndBroadcast(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = NotificationType.INFO,
    link?: string,
  ): Promise<Notification> {
    const created = await this.create(userId, title, message, type, link);
    const gateway = this.getGateway();
    if (!gateway) {
      return created;
    }

    await gateway.sendNotification(userId, {
      ...created,
      link: created.link ?? undefined,
    });
    const unreadCount = await this.getUnreadCount(userId);
    await gateway.sendUnreadCount(userId, unreadCount);
    return created;
  }

  async findAll(
    userId: string,
    query: GetNotificationsQuery,
  ): Promise<PaginatedNotifications> {
    const { page, limit, read } = query;
    const offset = (page - 1) * limit;

    const conditions = [eq(notification.userId, userId)];
    if (read !== undefined) {
      conditions.push(eq(notification.read, read));
    }

    const [{ count: total }] = await this.drizzle.db
      .select({ count: drizzleCount() })
      .from(notification)
      .where(and(...conditions));

    const data = await this.drizzle.db
      .select()
      .from(notification)
      .where(and(...conditions))
      .orderBy(notification.read, desc(notification.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const [updated] = await this.drizzle.db
      .update(notification)
      .set({ read: true })
      .where(and(eq(notification.id, id), eq(notification.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Notification not found');
    }

    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const [deleted] = await this.drizzle.db
      .delete(notification)
      .where(and(eq(notification.id, id), eq(notification.userId, userId)))
      .returning({ id: notification.id });

    if (!deleted) {
      throw new NotFoundException('Notification not found');
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    const [{ count: unreadCount }] = await this.drizzle.db
      .select({ count: drizzleCount() })
      .from(notification)
      .where(and(eq(notification.userId, userId), eq(notification.read, false)));

    return unreadCount;
  }

  private getGateway(): NotificationGateway | null {
    if (this.gateway) {
      return this.gateway;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NotificationGateway: Gateway } = require('./notification.gateway');
      this.gateway = this.moduleRef.get<NotificationGateway>(Gateway, {
        strict: false,
      });
      return this.gateway;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Notification gateway unavailable: ${message}`);
      return null;
    }
  }
}
