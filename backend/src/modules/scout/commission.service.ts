import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  scoutCommission,
  ScoutCommissionStatus,
} from './entities/scout-commission.schema';
import { scoutSubmission } from './entities/scout.schema';

@Injectable()
export class CommissionService {
  constructor(private drizzle: DrizzleService) {}

  async calculateCommission(submissionId: string, dealSize: number) {
    const [submission] = await this.drizzle.db
      .select({ scoutId: scoutSubmission.scoutId })
      .from(scoutSubmission)
      .where(eq(scoutSubmission.id, submissionId))
      .limit(1);

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const rate = 500; // 5% in basis points
    const amount = Math.floor(dealSize * (rate / 10000));

    const [commission] = await this.drizzle.db
      .insert(scoutCommission)
      .values({
        scoutId: submission.scoutId,
        submissionId,
        dealSize,
        commissionRate: rate,
        commissionAmount: amount,
        status: ScoutCommissionStatus.PENDING,
      })
      .returning();

    return commission;
  }

  async getCommissions(scoutId: string) {
    return this.drizzle.db
      .select()
      .from(scoutCommission)
      .where(eq(scoutCommission.scoutId, scoutId));
  }

  async getTotalEarnings(scoutId: string) {
    const commissions = await this.getCommissions(scoutId);
    return {
      total: commissions.reduce((sum, c) => sum + c.commissionAmount, 0),
      pending: commissions
        .filter((c) => c.status === 'pending')
        .reduce((sum, c) => sum + c.commissionAmount, 0),
      paid: commissions
        .filter((c) => c.status === 'paid')
        .reduce((sum, c) => sum + c.commissionAmount, 0),
    };
  }
}
