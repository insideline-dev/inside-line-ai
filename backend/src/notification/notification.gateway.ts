import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from './notification.service';
import type { JwtPayload } from '../auth/auth.service';
import type { NotificationPayload, NotificationCount, JobStatusEvent } from './dto';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private jwt: JwtService,
    private notificationService: NotificationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1] ||
        (client.request as any)?.cookies?.['access_token'];

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const payload = this.jwt.verify<JwtPayload>(token);
      const userId = payload.sub;

      client.data.userId = userId;

      const roomName = `user:${userId}`;
      await client.join(roomName);

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);

      const unreadCount = await this.notificationService.getUnreadCount(userId);
      this.sendUnreadCount(userId, unreadCount);
    } catch (error) {
      this.logger.error(`Connection rejected: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    this.logger.log(`Client disconnected: ${client.id} (user: ${userId || 'unknown'})`);
  }

  async sendNotification(userId: string, notification: NotificationPayload & { id: string }) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
    this.logger.debug(`Sent notification to user ${userId}: ${notification.title}`);
  }

  async sendUnreadCount(userId: string, count: number) {
    const payload: NotificationCount = { count };
    this.server.to(`user:${userId}`).emit('notification:count', payload);
    this.logger.debug(`Sent unread count to user ${userId}: ${count}`);
  }

  sendJobStatus(userId: string, event: JobStatusEvent) {
    this.server.to(`user:${userId}`).emit('job:status', event);
    this.logger.debug(`Sent job status to user ${userId}: ${event.jobType} → ${event.status}`);
  }
}
