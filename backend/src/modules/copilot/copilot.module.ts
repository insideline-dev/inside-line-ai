import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database";
import { CopilotAuditService } from "./copilot-audit.service";
import { CopilotService } from "./copilot.service";

@Module({
  imports: [DatabaseModule],
  providers: [CopilotAuditService, CopilotService],
  exports: [CopilotAuditService, CopilotService],
})
export class CopilotModule {}
