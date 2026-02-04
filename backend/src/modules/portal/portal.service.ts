import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { portal, Portal } from './entities';
import { CreatePortal, UpdatePortal, GetPortalsQuery } from './dto';

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(private drizzle: DrizzleService) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async isSlugTaken(slug: string): Promise<boolean> {
    const [existing] = await this.drizzle.db
      .select({ id: portal.id })
      .from(portal)
      .where(eq(portal.slug, slug))
      .limit(1);

    return !!existing;
  }

  async create(userId: string, dto: CreatePortal): Promise<Portal> {
    return this.drizzle.withRLS(userId, async (db) => {
      const slug = dto.slug || this.generateSlug(dto.name);

      const isTaken = await this.isSlugTaken(slug);
      if (isTaken) {
        throw new ConflictException(`Slug "${slug}" is already taken`);
      }

      const [created] = await db
        .insert(portal)
        .values({
          userId,
          ...dto,
          slug,
        })
        .returning();

      this.logger.log(`Created portal ${created.id} with slug "${slug}"`);
      return created;
    });
  }

  async findAll(userId: string, query: GetPortalsQuery) {
    return this.drizzle.withRLS(userId, async (db) => {
      const { page, limit } = query;
      const offset = (page - 1) * limit;

      const [items, [{ count }]] = await Promise.all([
        db
          .select()
          .from(portal)
          .where(eq(portal.userId, userId))
          .orderBy(desc(portal.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(portal)
          .where(eq(portal.userId, userId)),
      ]);

      return {
        data: items,
        meta: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    });
  }

  async findOne(id: string, userId: string): Promise<Portal> {
    return this.drizzle.withRLS(userId, async (db) => {
      const [found] = await db
        .select()
        .from(portal)
        .where(and(eq(portal.id, id), eq(portal.userId, userId)))
        .limit(1);

      if (!found) {
        throw new NotFoundException(`Portal with ID ${id} not found`);
      }

      return found;
    });
  }

  async findBySlug(slug: string): Promise<Portal> {
    const [found] = await this.drizzle.db
      .select()
      .from(portal)
      .where(and(eq(portal.slug, slug), eq(portal.isActive, true)))
      .limit(1);

    if (!found) {
      throw new NotFoundException(`Portal with slug "${slug}" not found`);
    }

    return found;
  }

  async update(id: string, userId: string, dto: UpdatePortal): Promise<Portal> {
    return this.drizzle.withRLS(userId, async (db) => {
      await this.findOne(id, userId);

      const [updated] = await db
        .update(portal)
        .set({
          ...dto,
          updatedAt: new Date(),
        })
        .where(eq(portal.id, id))
        .returning();

      this.logger.log(`Updated portal ${id}`);
      return updated;
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    return this.drizzle.withRLS(userId, async (db) => {
      await this.findOne(id, userId);

      await db.delete(portal).where(eq(portal.id, id));

      this.logger.log(`Deleted portal ${id}`);
    });
  }
}
