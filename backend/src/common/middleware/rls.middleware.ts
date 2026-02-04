import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { DrizzleService } from '../../database/drizzle.service';

/**
 * RLS Middleware
 * Sets the 'app.current_user_id' session variable in PostgreSQL
 * for Row-Level Security policies to use.
 *
 * NOTE: SET LOCAL only persists within a transaction. Since middleware runs
 * outside of the service-layer transactions, this context is lost by the time
 * queries execute. Services that need RLS must set the context within their
 * own transactions using sql.raw().
 */
@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(private readonly drizzle: DrizzleService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;
    const userId = user?.id;
    const userRole = user?.role || 'guest';

    if (userId) {
      try {
        // Note: SET LOCAL doesn't support parameterized queries, so we use sql.raw
        // This is safe because userId is a UUID from the JWT (validated by Passport)
        await this.drizzle.db.execute(
          sql.raw(
            `SET LOCAL app.current_user_id = '${userId}'; SET LOCAL app.current_user_role = '${userRole}';`,
          ),
        );
      } catch (error) {
        // Log error but don't block the request unless critical
        console.error('Error setting RLS user context:', error);
      }
    }

    next();
  }
}
