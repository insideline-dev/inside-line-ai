import { Module } from "@nestjs/common";
import { ConfigModule } from "./config";
import { DatabaseModule } from "./database";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth";
import { QueueModule } from "./queue";
import { StorageModule } from "./storage";
import { EmailModule } from "./email";
import { NotificationModule } from "./notification/notification.module";
import { StartupModule } from "./modules/startup";
import { PortalModule } from "./modules/portal";
import { ScoutModule } from "./modules/scout";
import { AdminModule } from "./modules/admin";
import { AnalysisModule } from "./modules/analysis";
import { TwilioModule } from "./modules/integrations/twilio/twilio.module";
import { AgentMailModule } from "./modules/integrations/agentmail/agentmail.module";
import { UnipileModule } from "./modules/integrations/unipile/unipile.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    QueueModule,
    StorageModule,
    EmailModule,
    AuthModule,
    NotificationModule,
    StartupModule,
    PortalModule,
    ScoutModule,
    AdminModule,
    AnalysisModule,
    TwilioModule,
    AgentMailModule,
    UnipileModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
