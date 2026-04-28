import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../../database";
import { QueueModule } from "../../../queue";
import { NotificationModule } from "../../../notification/notification.module";
import { AiModule } from "../../ai";
import { InvestorOnboardingController } from "./investor-onboarding.controller";
import { InvestorOnboardingProcessor } from "./investor-onboarding.processor";
import { InvestorOnboardingService } from "./investor-onboarding.service";
import { InvestorModule } from "../investor.module";

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    NotificationModule,
    AiModule,
    forwardRef(() => InvestorModule),
  ],
  controllers: [InvestorOnboardingController],
  providers: [InvestorOnboardingService, InvestorOnboardingProcessor],
  exports: [InvestorOnboardingService],
})
export class InvestorOnboardingModule {}
