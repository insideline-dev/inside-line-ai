import { Injectable, OnModuleDestroy, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

@Injectable()
export class DrizzleService implements OnModuleDestroy {
  public db: PostgresJsDatabase<typeof schema>;
  private client: postgres.Sql;

  constructor(private configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('DATABASE_URL')!;
    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client, { schema });
  }

  /**
   * Execute a callback with RLS context set for a specific user.
   * This ensures the SET LOCAL and subsequent queries run on the same connection.
   *
   * @param userId - The user ID to set as RLS context
   * @param callback - Function containing your database operations
   */
  async withRLS<T>(
    userId: string,
    callback: (db: PostgresJsDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      // SET LOCAL only persists within this transaction
      await tx.execute(sql.raw(`SET LOCAL app.current_user_id = '${userId}'`));
      return callback(tx as unknown as PostgresJsDatabase<typeof schema>);
    });
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
