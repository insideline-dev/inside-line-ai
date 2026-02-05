import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  investorInterest,
  InvestorInterestStatus,
} from './entities/investor-interest.schema';
import { user } from '../../auth/entities/auth.schema';

@Injectable()
export class InvestorInterestService {
  constructor(private drizzle: DrizzleService) {}

  async getInterest(startupId: string) {
    return this.drizzle.db
      .select({
        id: investorInterest.id,
        investorId: investorInterest.investorId,
        startupId: investorInterest.startupId,
        status: investorInterest.status,
        notes: investorInterest.notes,
        createdAt: investorInterest.createdAt,
        updatedAt: investorInterest.updatedAt,
        investorName: user.name,
      })
      .from(investorInterest)
      .leftJoin(user, eq(investorInterest.investorId, user.id))
      .where(eq(investorInterest.startupId, startupId))
      .orderBy(desc(investorInterest.updatedAt));
  }

  async respondToInterest(
    interestId: string,
    response: InvestorInterestStatus,
  ) {
    const [interest] = await this.drizzle.db
      .update(investorInterest)
      .set({ status: response, updatedAt: new Date() })
      .where(eq(investorInterest.id, interestId))
      .returning();

    if (!interest) {
      throw new NotFoundException('Investor interest not found');
    }

    return interest;
  }
}
