import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../../auth/decorators";
import { JwtAuthGuard } from "../../../auth/guards";
import { UserRole } from "../../../auth/entities/auth.schema";
import { SubmitWebsiteDto } from "./dto/submit-website.dto";
import { InvestorOnboardingService } from "./investor-onboarding.service";

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

@Controller("investor/onboarding")
@UseGuards(JwtAuthGuard)
export class InvestorOnboardingController {
  constructor(private readonly onboarding: InvestorOnboardingService) {}

  @Post("website")
  @HttpCode(HttpStatus.ACCEPTED)
  async submitWebsite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitWebsiteDto,
  ) {
    if (user.role !== UserRole.INVESTOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only investors can submit an onboarding website");
    }

    return this.onboarding.submitWebsite(user.id, dto);
  }
}
