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
import { JwtAuthGuard } from "../../../../auth/guards";
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
@UseGuards(JwtAuthGuard)
@Controller("screening")
export class ScreeningTriageController {
  constructor(
    private readonly triage: ScreeningTriageService,
    private readonly screeningOutput: ScreeningOutputService,
  ) {}

  @Get(":startupId/decision")
  @ApiOperation({ summary: "Get the latest triage decision for a startup" })
  @ApiResponse({ status: 200, type: ScreeningDecisionResponseDto })
  @ApiResponse({ status: 404, description: "No decision recorded yet" })
  async getLatest(
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
  ): Promise<ScreeningDecisionResponseDto> {
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
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
  ): Promise<ScreeningOutputResponseDto> {
    const output = await this.screeningOutput.latestForStartup(startupId);
    if (!output) {
      throw new NotFoundException(
        `No screening output found for startup ${startupId}`,
      );
    }
    return output;
  }
}
