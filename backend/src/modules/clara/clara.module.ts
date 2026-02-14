import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../../database";
import { StorageModule } from "../../storage";
import { NotificationModule } from "../../notification/notification.module";
import { AgentMailModule } from "../integrations/agentmail/agentmail.module";
import { StartupModule } from "../startup";
import { ClaraService } from "./clara.service";
import { ClaraAiService } from "./clara-ai.service";
import { ClaraSubmissionService } from "./clara-submission.service";
import { ClaraConversationService } from "./clara-conversation.service";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    StorageModule,
    NotificationModule,
    forwardRef(() => AgentMailModule),
    StartupModule,
  ],
  providers: [
    ClaraService,
    ClaraAiService,
    ClaraSubmissionService,
    ClaraConversationService,
  ],
  exports: [ClaraService],
})
export class ClaraModule {}
