import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { investorNote } from './entities/investor-note.schema';
import { startup } from '../startup/entities/startup.schema';
import type { CreateNote, UpdateNote } from './dto';

@Injectable()
export class InvestorNoteService {
  constructor(private drizzle: DrizzleService) {}

  async create(investorId: string, dto: CreateNote) {
    const [note] = await this.drizzle.db
      .insert(investorNote)
      .values({
        investorId,
        startupId: dto.startupId,
        content: dto.content,
        category: dto.category,
        isPinned: dto.isPinned ?? false,
      })
      .returning();

    return note;
  }

  async getNotes(investorId: string, startupId: string) {
    return this.drizzle.db
      .select()
      .from(investorNote)
      .where(
        and(
          eq(investorNote.investorId, investorId),
          eq(investorNote.startupId, startupId),
        ),
      )
      .orderBy(desc(investorNote.updatedAt));
  }

  async getAllNotes(investorId: string) {
    return this.drizzle.db
      .select({
        id: investorNote.id,
        startupId: investorNote.startupId,
        startupName: startup.name,
        content: investorNote.content,
        category: investorNote.category,
        isPinned: investorNote.isPinned,
        createdAt: investorNote.createdAt,
        updatedAt: investorNote.updatedAt,
      })
      .from(investorNote)
      .leftJoin(startup, eq(investorNote.startupId, startup.id))
      .where(eq(investorNote.investorId, investorId))
      .orderBy(desc(investorNote.updatedAt));
  }

  async update(noteId: string, investorId: string, dto: UpdateNote) {
    const updates: Partial<UpdateNote> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (dto.content !== undefined) updates.content = dto.content;
    if (dto.category !== undefined) updates.category = dto.category;
    if (dto.isPinned !== undefined) updates.isPinned = dto.isPinned;

    const [note] = await this.drizzle.db
      .update(investorNote)
      .set(updates)
      .where(and(eq(investorNote.id, noteId), eq(investorNote.investorId, investorId)))
      .returning();

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    return note;
  }

  async delete(noteId: string, investorId: string) {
    const [note] = await this.drizzle.db
      .delete(investorNote)
      .where(and(eq(investorNote.id, noteId), eq(investorNote.investorId, investorId)))
      .returning({ id: investorNote.id });

    if (!note) {
      throw new NotFoundException('Note not found');
    }
  }
}
