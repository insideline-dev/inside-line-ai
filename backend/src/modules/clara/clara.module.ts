import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../database";
import { StorageModule } from "../../storage";
import { NotificationModule } from "../../notification/notification.module";
import { AgentMailModule } from "../integrations/agentmail/agentmail.module";
import { AiModule } from "../ai";
import { InvestorModule } from "../investor/investor.module";
import { ClaraService } from "./clara.service";
import { ClaraAiService } from "./clara-ai.service";
import { ClaraSubmissionService } from "./clara-submission.service";
import { ClaraConversationService } from "./clara-conversation.service";
import { ClaraToolsService } from "./clara-tools.service";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    NotificationModule,
    forwardRef(() => AgentMailModule),
    forwardRef(() => AiModule),
    InvestorModule,
  ],
  providers: [
    ClaraService,
    ClaraAiService,
    ClaraSubmissionService,
    ClaraConversationService,
    ClaraToolsService,
  ],
  exports: [ClaraService],
})
export class ClaraModule {}
