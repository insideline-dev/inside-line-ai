import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
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

  async withRLS<T>(
    _userId: string,
    callback: (db: PostgresJsDatabase<typeof schema>) => Promise<T>,
  ): Promise<T> {
    return callback(this.db);
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
