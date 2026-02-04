import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from './config';
import { DatabaseModule } from './database';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth';
import { QueueModule } from './queue';
import { StorageModule } from './storage';
import { EmailModule } from './email';
import { RlsMiddleware } from './common';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueueModule,
    StorageModule,
    EmailModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RlsMiddleware).forRoutes('*');
  }
}
