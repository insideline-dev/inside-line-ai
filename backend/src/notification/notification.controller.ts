import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { CurrentUser } from '../auth/decorators';
import type { DbUser } from '../auth/user-auth.service';
import type { GetNotificationsQueryDto } from './dto';

@ApiTags('notifications')
@Controller('notifications')
@ApiBearerAuth('JWT')
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    private notificationGateway: NotificationGateway,
  ) {}

  @Get()
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  @ApiOperation({ summary: 'Get my notifications (paginated)' })
  @ApiResponse({ status: 200, description: 'List of notifications' })
  async getNotifications(
    @CurrentUser() user: DbUser,
    @Query() query: GetNotificationsQueryDto,
  ) {
    return this.notificationService.findAll(user.id, query);
  }

  @Patch(':id/read')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @CurrentUser() user: DbUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const notification = await this.notificationService.markRead(id, user.id);

    // Send updated unread count via WebSocket
    const unreadCount = await this.notificationService.getUnreadCount(user.id);
    this.notificationGateway.sendUnreadCount(user.id, unreadCount);

    return notification;
  }

  @Delete(':id')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(
    @CurrentUser() user: DbUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificationService.delete(id, user.id);

    // Send updated unread count via WebSocket
    const unreadCount = await this.notificationService.getUnreadCount(user.id);
    this.notificationGateway.sendUnreadCount(user.id, unreadCount);
  }
}
