import { Injectable } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { investorPortfolio } from './entities/investor-portfolio.schema';
import { startup } from '../startup/entities/startup.schema';
import type { AddPortfolio } from './dto';

@Injectable()
export class PortfolioService {
  constructor(private drizzle: DrizzleService) {}

  async addToPortfolio(investorId: string, dto: AddPortfolio) {
    const [item] = await this.drizzle.db
      .insert(investorPortfolio)
      .values({
        investorId,
        startupId: dto.startupId,
        dealSize: dto.dealSize,
        dealStage: dto.dealStage,
        investedAt: dto.investedAt ? new Date(dto.investedAt) : new Date(),
        notes: dto.notes,
      })
      .returning();

    return item;
  }

  async getPortfolio(investorId: string) {
    return this.drizzle.db
      .select({
        id: investorPortfolio.id,
        startupId: investorPortfolio.startupId,
        dealSize: investorPortfolio.dealSize,
        dealStage: investorPortfolio.dealStage,
        investedAt: investorPortfolio.investedAt,
        exitedAt: investorPortfolio.exitedAt,
        notes: investorPortfolio.notes,
        createdAt: investorPortfolio.createdAt,
        updatedAt: investorPortfolio.updatedAt,
        startupName: startup.name,
        startupIndustry: startup.industry,
        startupStage: startup.stage,
      })
      .from(investorPortfolio)
      .leftJoin(startup, eq(investorPortfolio.startupId, startup.id))
      .where(eq(investorPortfolio.investorId, investorId))
      .orderBy(desc(investorPortfolio.investedAt));
  }
}
