import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { JwtAuthGuard } from "../../../auth/guards";
import { UserRole } from "../../../auth/entities/auth.schema";
import { RolesGuard } from "../../startup/guards";
import { Roles } from "../../startup/decorators/roles.decorator";
import { FundingEnrichmentService } from "./funding-enrichment.service";
import {
  EnrichFundingResponseDto,
  FundingHistoryListResponseDto,
  type EnrichFundingResponseDtoShape,
  type FundingHistoryListResponseDtoShape,
  type FundingHistoryRowDtoShape,
} from "./dto";
import type { StartupFundingHistory } from "../../startup/entities/startup-funding-history.schema";

@ApiTags("startups/funding-history")
@Controller("startups")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth("JWT")
export class FundingEnrichmentController {
  constructor(
    private readonly fundingEnrichmentService: FundingEnrichmentService,
  ) {}

  /**
   * Read persisted funding history for a startup. Returns `empty: true`
   * when no canonical match exists so the frontend can render the
   * "no public funding history found" state without a stack trace.
   */
  @Get(":startupId/funding-history")
  @Roles(UserRole.FOUNDER, UserRole.INVESTOR, UserRole.ADMIN, UserRole.SCOUT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List canonical funding-history rows" })
  @ApiResponse({ status: 200, type: FundingHistoryListResponseDto })
  async list(
    @Param("startupId", ParseUUIDPipe) startupId: string,
  ): Promise<FundingHistoryListResponseDtoShape> {
    const rows = await this.fundingEnrichmentService.listForStartup(startupId);
    return {
      startupId,
      rows: rows.map(toRowDto),
      empty: rows.length === 0,
    };
  }

  /**
   * Manually re-pull canonical sources for a startup. Admin only.
   * Idempotent — second invocation updates `lastReconciledAt` without
   * duplicating rows.
   */
  @Post(":startupId/enrichment/funding")
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Manually re-trigger funding enrichment" })
  @ApiResponse({ status: 200, type: EnrichFundingResponseDto })
  @ApiResponse({
    status: 503,
    description: "No funding-history providers configured",
  })
  async enrich(
    @Param("startupId", ParseUUIDPipe) startupId: string,
  ): Promise<EnrichFundingResponseDtoShape> {
    if (!this.fundingEnrichmentService.isConfigured()) {
      throw new ServiceUnavailableException(
        "Funding enrichment is unavailable — no providers are configured",
      );
    }

    const result =
      await this.fundingEnrichmentService.enrichStartup(startupId);
    return {
      startupId: result.startupId,
      providersAttempted: result.providersAttempted,
      providersWithMatches: result.providersWithMatches,
      rows: result.rows.map(toRowDto),
    };
  }
}

function toRowDto(row: StartupFundingHistory): FundingHistoryRowDtoShape {
  return {
    id: row.id,
    startupId: row.startupId,
    roundType: row.roundType,
    announcedAt: row.announcedAt,
    amount: row.amount,
    currency: row.currency,
    valuationPostMoney: row.valuationPostMoney,
    leadInvestor: row.leadInvestor,
    investors: row.investors,
    sources: row.sources,
    evidenceConfidence: row.evidenceConfidence,
    lastReconciledAt: row.lastReconciledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
