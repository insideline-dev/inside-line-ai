import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../database";
import { StorageModule } from "../../storage";
import { NotificationModule } from "../../notification/notification.module";
import { AgentMailModule } from "../integrations/agentmail/agentmail.module";
import { AiModule } from "../ai";
import { CopilotModule } from "../copilot";
import { InvestorModule } from "../investor/investor.module";
import { StartupModule } from "../startup";
import { AdminModule } from "../admin";
import { ClaraService } from "./clara.service";
import { ClaraAiService } from "./clara-ai.service";
import { ClaraSubmissionService } from "./clara-submission.service";
import { ClaraConversationService } from "./clara-conversation.service";
import { ClaraToolsService } from "./clara-tools.service";
import { ClaraChannelService } from "./clara-channel.service";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    NotificationModule,
    forwardRef(() => AgentMailModule),
    forwardRef(() => AiModule),
    CopilotModule,
    InvestorModule,
    StartupModule,
    AdminModule,
  ],
  providers: [
    ClaraService,
    ClaraAiService,
    ClaraSubmissionService,
    ClaraConversationService,
    ClaraToolsService,
    ClaraChannelService,
  ],
  exports: [ClaraService],
})
export class ClaraModule {}
