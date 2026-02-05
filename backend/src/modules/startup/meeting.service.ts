import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { meeting, MeetingStatus } from './entities/meeting.schema';
import { user } from '../../auth/entities/auth.schema';
import type { ScheduleMeeting } from './dto';

@Injectable()
export class MeetingService {
  constructor(private drizzle: DrizzleService) {}

  async scheduleMeeting(startupId: string, dto: ScheduleMeeting) {
    const [mtg] = await this.drizzle.db
      .insert(meeting)
      .values({
        startupId,
        investorId: dto.investorId,
        scheduledAt: new Date(dto.scheduledAt),
        duration: dto.duration ?? 30,
        location: dto.location,
        notes: dto.notes,
        status: MeetingStatus.SCHEDULED,
      })
      .returning();
    return mtg;
  }

  async getMeetings(startupId: string) {
    return this.drizzle.db
      .select({
        id: meeting.id,
        startupId: meeting.startupId,
        investorId: meeting.investorId,
        scheduledAt: meeting.scheduledAt,
        duration: meeting.duration,
        location: meeting.location,
        notes: meeting.notes,
        status: meeting.status,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt,
        investorName: user.name,
      })
      .from(meeting)
      .leftJoin(user, eq(meeting.investorId, user.id))
      .where(eq(meeting.startupId, startupId))
      .orderBy(desc(meeting.scheduledAt));
  }
}
