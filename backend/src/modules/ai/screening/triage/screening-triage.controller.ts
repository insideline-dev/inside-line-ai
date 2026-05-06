import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../../../../auth/decorators";
import { UserRole } from "../../../../auth/entities/auth.schema";
import { JwtAuthGuard } from "../../../../auth/guards";
import { PdfService } from "../../../startup/pdf.service";
import { Roles } from "../../../startup/decorators/roles.decorator";
import { RolesGuard } from "../../../startup/guards";
import {
  ScreeningOutputResponseDto,
  ScreeningOutputService,
} from "../../contracts/screening-output";
import { ScreeningDecisionResponseDto } from "./dto/screening-decision-response.dto";
import { ScreeningTriageService } from "./screening-triage.service";

/**
 * Read-only surface for the deal-level triage decision. The frontend deal
 * card (DS-E6-F1-S1) consumes the latest decision per startup so investors
 * can filter the inbox to the REVIEW bucket without joining lens rows.
 *
 * Mutations are not exposed: decisions are produced exclusively by the
 * SCREENING pipeline phase via {@link ScreeningTriageService.decide}.
 */
@ApiTags("Screening")
@ApiBearerAuth("JWT")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INVESTOR, UserRole.ADMIN)
@Controller("screening")
export class ScreeningTriageController {
  constructor(
    private readonly triage: ScreeningTriageService,
    private readonly screeningOutput: ScreeningOutputService,
    private readonly pdfService: PdfService,
  ) {}

  @Get(":startupId/decision")
  @ApiOperation({ summary: "Get the latest triage decision for a startup" })
  @ApiResponse({ status: 200, type: ScreeningDecisionResponseDto })
  @ApiResponse({ status: 404, description: "No decision recorded yet" })
  async getLatest(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
  ): Promise<ScreeningDecisionResponseDto> {
    await this.pdfService.verifyAccess(startupId, user.id);
    const decision = await this.triage.latestForStartup(startupId);
    if (!decision) {
      throw new NotFoundException(
        `No screening decision found for startup ${startupId}`,
      );
    }
    return decision;
  }

  /**
   * DS-E9-F1-S1 — analyst clicks any claim on the deal card and jumps to
   * its source. The deal card consumes this endpoint to render evidence
   * with clickable URLs per lens. Same v1 contract DD will consume.
   */
  @Get(":startupId/output")
  @ApiOperation({
    summary: "Get the latest ScreeningOutput v1 contract for a startup",
  })
  @ApiResponse({ status: 200, type: ScreeningOutputResponseDto })
  @ApiResponse({ status: 404, description: "No screening output yet" })
  async getOutput(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
  ): Promise<ScreeningOutputResponseDto> {
    await this.pdfService.verifyAccess(startupId, user.id);
    const output = await this.screeningOutput.latestForStartup(startupId);
    if (!output) {
      throw new NotFoundException(
        `No screening output found for startup ${startupId}`,
      );
    }
    return output;
  }
}
