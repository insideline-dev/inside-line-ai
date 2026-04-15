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
    const nodeEnv = this.configService.get<string>("NODE_ENV", "development");
    const devDbUrl = this.configService.get<string | undefined>(
      "DEV_DATABASE_URL",
    );
    const databaseUrl =
      nodeEnv === "development" && devDbUrl ? devDbUrl : this.configService.get<string>("DATABASE_URL")!;
    const max = this.configService.get<number>('DB_POOL_MAX', 20);
    const connectTimeout = this.configService.get<number>(
      'DB_CONNECT_TIMEOUT_SECONDS',
      10,
    );
    const idleTimeout = this.configService.get<number>(
      'DB_IDLE_TIMEOUT_SECONDS',
      30,
    );
    const maxLifetime = this.configService.get<number>(
      'DB_MAX_LIFETIME_SECONDS',
      1800,
    );
    const disablePrepareForPooler = this.configService.get<boolean>(
      'DB_DISABLE_PREPARE_FOR_POOLER',
      true,
    );
    const looksLikePooler =
      /-pooler\./i.test(databaseUrl) || /pgbouncer=true/i.test(databaseUrl);

    this.client = postgres(databaseUrl, {
      max,
      connect_timeout: connectTimeout,
      idle_timeout: idleTimeout,
      max_lifetime: maxLifetime,
      // Neon/pgBouncer transaction poolers can intermittently fail with prepared statements.
      prepare: disablePrepareForPooler && looksLikePooler ? false : undefined,
      onnotice: () => undefined,
    });
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
