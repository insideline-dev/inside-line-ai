import {
  Controller,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { CurrentUser } from "../../auth/decorators";
import { UserRole } from "../../auth/entities/auth.schema";
import { JwtAuthGuard } from "../../auth/guards";
import { Roles } from "../startup/decorators/roles.decorator";
import { RolesGuard } from "../startup/guards";
import { PdfService } from "../startup/pdf.service";
import {
  RegenerateMemoSectionResponseDto,
  type RegenerateMemoSectionResponse,
} from "./dto/memo-section-regenerate.dto";
import type { EvaluationAgentKey } from "./interfaces/agent.interface";
import { MEMO_SECTION_ORDER } from "./agents/synthesis/synthesis-chunk.config";
import { MemoSectionRegenerationService } from "./services/memo-section-regeneration.service";

const VALID_SECTION_KEYS: ReadonlySet<EvaluationAgentKey> = new Set(
  MEMO_SECTION_ORDER.map((s) => s.key),
);

/**
 * DG-E1-F1-S2 — section-scoped memo regeneration.
 *
 * Lives in the AI module because regeneration runs the same synthesis prompt
 * the pipeline uses; mounted under `/startups/:startupId/memo` to keep
 * read/write surfaces collocated from the operator's POV.
 *
 * Auth: re-uses the same access check the memo PDF surface uses
 * (`PdfService.verifyAccess`) so anyone who can see the memo can regenerate
 * any one of its sections. Limited to investor + admin via `RolesGuard`.
 */
@ApiTags("Memo")
@ApiBearerAuth("JWT")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INVESTOR, UserRole.ADMIN)
@Controller("startups/:startupId/memo")
export class MemoController {
  private readonly logger = new Logger(MemoController.name);

  constructor(
    private readonly regenerationService: MemoSectionRegenerationService,
    private readonly pdfService: PdfService,
  ) {}

  @Post("sections/:sectionKey/regenerate")
  @ApiOperation({
    summary: "Regenerate a single memo section",
    description:
      "Re-runs the memo synthesis prompt for one section only. Operator edits in other sections are preserved. Idempotent for the same (startupId, sectionKey) — concurrent calls return 409.",
  })
  @ApiResponse({ status: 200, type: RegenerateMemoSectionResponseDto })
  @ApiResponse({ status: 404, description: "Unknown section key or missing prerequisites" })
  @ApiResponse({ status: 409, description: "Regeneration already in progress" })
  async regenerateSection(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
    @Param("sectionKey") sectionKey: string,
  ): Promise<RegenerateMemoSectionResponse> {
    await this.pdfService.verifyAccess(startupId, user.id);

    if (!this.isValidSectionKey(sectionKey)) {
      // Throw an explicit 404 instead of letting the service do it so the
      // error surface stays consistent with the OpenAPI doc above.
      const validKeys = [...VALID_SECTION_KEYS].join(", ");
      throw new NotFoundException(
        `Unknown memo section key "${sectionKey}". Valid keys: ${validKeys}`,
      );
    }

    this.logger.log(
      `[MemoController] Section regenerate requested | Startup: ${startupId} | Section: ${sectionKey} | User: ${user.id}`,
    );

    const result = await this.regenerationService.regenerate(
      startupId,
      sectionKey,
    );

    return {
      startupId: result.startupId,
      sectionKey: result.sectionKey,
      regeneratedAt: result.regeneratedAt,
      usedFallback: result.usedFallback,
      overwroteOperatorEdits: result.overwroteOperatorEdits,
      section: {
        sectionKey: result.sectionKey,
        title: result.section.title,
        content: result.section.content,
        highlights: result.section.highlights ?? [],
        concerns: result.section.concerns ?? [],
        sources: result.section.sources ?? [],
        regeneratedAt:
          result.section.regeneratedAt ?? result.regeneratedAt,
      },
    };
  }

  private isValidSectionKey(value: string): value is EvaluationAgentKey {
    return VALID_SECTION_KEYS.has(value as EvaluationAgentKey);
  }
}
