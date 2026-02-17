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
import { JWT_COOKIE_NAME } from '../auth/auth.constants';
import type { JwtPayload } from '../auth/auth.service';
import type { NotificationPayload, NotificationCount, JobStatusEvent } from './dto';
import type { PipelinePhase, PhaseStatus, PipelineStatus } from '../modules/ai/interfaces/pipeline.interface';

interface PipelineEventPayloads {
  'pipeline:started': { startupId: string; pipelineRunId: string };
  'pipeline:completed': { startupId: string; pipelineRunId: string; status: PipelineStatus; overallScore?: number; error?: string };
  'pipeline:failed': { startupId: string; pipelineRunId: string; status: PipelineStatus; overallScore?: number; error?: string };
  'pipeline:cancelled': { startupId: string; pipelineRunId: string; status: PipelineStatus; overallScore?: number; error?: string };
  'pipeline:updated': { startupId: string; pipelineRunId: string; status: PipelineStatus; overallScore?: number; error?: string };
  'phase:started': { startupId: string; pipelineRunId: string; phase: PipelinePhase; status: PhaseStatus; error?: string };
  'phase:completed': { startupId: string; pipelineRunId: string; phase: PipelinePhase; status: PhaseStatus; error?: string };
  'phase:failed': { startupId: string; pipelineRunId: string; phase: PipelinePhase; status: PhaseStatus; error?: string };
  'phase:waiting': { startupId: string; pipelineRunId: string; phase: PipelinePhase; status: PhaseStatus; error?: string };
  'phase:skipped': { startupId: string; pipelineRunId: string; phase: PipelinePhase; status: PhaseStatus; error?: string };
  'phase:updated': { startupId: string; pipelineRunId: string; phase: PipelinePhase; status: PhaseStatus; error?: string };
  'agent:progress': {
    startupId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    agent: {
      key: string;
      status: string;
      startedAt?: string;
      completedAt?: string;
      progress?: number;
      error?: string;
      attempts?: number;
      retryCount?: number;
      usedFallback?: boolean;
      lastEvent?: string;
      lastEventAt?: string;
    };
  };
  'agent:completed': {
    startupId: string;
    pipelineRunId: string;
    phase: PipelinePhase;
    agent: {
      key: string;
      status: string;
      startedAt?: string;
      completedAt?: string;
      progress?: number;
      error?: string;
      attempts?: number;
      retryCount?: number;
      usedFallback?: boolean;
      lastEvent?: string;
      lastEventAt?: string;
    };
  };
}

function parseCookies(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

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
      const authHeader = client.handshake.headers?.authorization;
      const bearerToken =
        authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

      const rawCookies = client.request?.headers?.cookie;
      const cookies = rawCookies ? parseCookies(rawCookies) : {};
      const cookieToken = cookies[JWT_COOKIE_NAME];

      const token =
        client.handshake.auth?.token ||
        bearerToken ||
        cookieToken;

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
      this.logger.warn(`Connection rejected: ${error instanceof Error ? error.message : String(error)}`);
      client.emit('error', { message: 'Authentication failed' });
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

  sendPipelineEvent<E extends keyof PipelineEventPayloads>(userId: string, event: E, payload: PipelineEventPayloads[E]) {
    this.server.to(`user:${userId}`).emit(event, payload);
    this.logger.debug(`Sent pipeline event to user ${userId}: ${event}`);
  }
}
