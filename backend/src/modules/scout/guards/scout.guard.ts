import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from '../../../database';
import { scoutApplication, ScoutApplicationStatus } from '../entities/scout.schema';

@Injectable()
export class ScoutGuard implements CanActivate {
  constructor(private drizzle: DrizzleService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user.id;
    const investorId = request.body.investorId || request.params.investorId;

    if (!investorId) {
      throw new ForbiddenException('Investor ID is required');
    }

    const [application] = await this.drizzle.db
      .select()
      .from(scoutApplication)
      .where(
        and(
          eq(scoutApplication.userId, userId),
          eq(scoutApplication.investorId, investorId),
          eq(scoutApplication.status, ScoutApplicationStatus.APPROVED),
        ),
      )
      .limit(1);

    if (!application) {
      throw new ForbiddenException(
        'You are not an approved scout for this investor',
      );
    }

    return true;
  }
}
