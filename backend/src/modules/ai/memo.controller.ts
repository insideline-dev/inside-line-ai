import {
  Body,
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
  ApplyRewriteRequestDto,
  ApplyRewriteResponseDto,
  RewriteClaimRequestDto,
  RewriteClaimResponseDto,
  type ApplyRewriteResponse,
  type RewriteClaimResponse,
} from "./dto/memo-claim-rewrite.dto";
import {
  RegenerateMemoSectionResponseDto,
  type RegenerateMemoSectionResponse,
} from "./dto/memo-section-regenerate.dto";
import type { EvaluationAgentKey } from "./interfaces/agent.interface";
import { MEMO_SECTION_ORDER } from "./agents/synthesis/synthesis-chunk.config";
import { MemoClaimRewriteService } from "./services/memo-claim-rewrite.service";
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
    private readonly claimRewriteService: MemoClaimRewriteService,
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

  @Post("claims/rewrite")
  @ApiOperation({
    summary: "Suggest up to 3 rewrites for an operator-selected memo claim",
    description:
      "DG-E1-F3-S1 — runs the `memo.claim.rewrite` prompt and returns at most 3 candidates. Does NOT persist; the operator's accept-flow calls `apply-rewrite`. Source linkage is preserved by prompt + a server-side factual-marker filter.",
  })
  @ApiResponse({ status: 200, type: RewriteClaimResponseDto })
  @ApiResponse({ status: 400, description: "Empty originalText" })
  @ApiResponse({ status: 404, description: "Unknown section key" })
  async suggestClaimRewrite(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
    @Body() body: RewriteClaimRequestDto,
  ): Promise<RewriteClaimResponse> {
    await this.pdfService.verifyAccess(startupId, user.id);

    if (!this.isValidSectionKey(body.sectionKey)) {
      const validKeys = [...VALID_SECTION_KEYS].join(", ");
      throw new NotFoundException(
        `Unknown memo section key "${body.sectionKey}". Valid keys: ${validKeys}`,
      );
    }

    const sectionMeta = MEMO_SECTION_ORDER.find((s) => s.key === body.sectionKey);
    const sectionTitle = sectionMeta?.title ?? body.sectionKey;

    this.logger.log(
      `[MemoController] Claim rewrite requested | Startup: ${startupId} | Section: ${body.sectionKey} | User: ${user.id}`,
    );

    const result = await this.claimRewriteService.rewriteClaim({
      startupId,
      sectionKey: body.sectionKey,
      sectionTitle,
      originalText: body.originalText,
      instruction: body.instruction,
      sourceIds: body.sourceIds,
    });

    return {
      startupId: result.startupId,
      sectionKey: result.sectionKey,
      originalText: result.originalText,
      rewrites: result.rewrites,
      candidateCountBeforeFilter: result.candidateCountBeforeFilter,
      usedFallback: result.usedFallback,
    };
  }

  @Post("sections/:sectionKey/apply-rewrite")
  @ApiOperation({
    summary: "Persist an operator-accepted rewrite for a memo section",
    description:
      "DG-E1-F3-S1 — writes operator-edited narrative through the section-regeneration JSON-merge path. No model call. Other sections + executive summary + DDAs are preserved. Citation linkage is preserved by default; pass `sources` only to override.",
  })
  @ApiResponse({ status: 200, type: ApplyRewriteResponseDto })
  @ApiResponse({ status: 404, description: "Unknown section key or missing evaluation row" })
  @ApiResponse({ status: 409, description: "Another memo write is in progress for this section" })
  async applyRewrite(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param("startupId", new ParseUUIDPipe()) startupId: string,
    @Param("sectionKey") sectionKey: string,
    @Body() body: ApplyRewriteRequestDto,
  ): Promise<ApplyRewriteResponse> {
    await this.pdfService.verifyAccess(startupId, user.id);

    if (!this.isValidSectionKey(sectionKey)) {
      const validKeys = [...VALID_SECTION_KEYS].join(", ");
      throw new NotFoundException(
        `Unknown memo section key "${sectionKey}". Valid keys: ${validKeys}`,
      );
    }

    this.logger.log(
      `[MemoController] Apply rewrite requested | Startup: ${startupId} | Section: ${sectionKey} | User: ${user.id}`,
    );

    const result = await this.regenerationService.applyOperatorRewrite(
      startupId,
      sectionKey,
      {
        newContent: body.newContent,
        sources: body.sources,
      },
    );

    return {
      startupId: result.startupId,
      sectionKey: result.sectionKey,
      regeneratedAt: result.regeneratedAt,
      overwroteOperatorEdits: result.overwroteOperatorEdits,
      section: {
        sectionKey: result.sectionKey,
        title: result.section.title,
        content: result.section.content,
        highlights: result.section.highlights ?? [],
        concerns: result.section.concerns ?? [],
        sources: result.section.sources ?? [],
        regeneratedAt: result.section.regeneratedAt ?? result.regeneratedAt,
      },
    };
  }

  private isValidSectionKey(value: string): value is EvaluationAgentKey {
    return VALID_SECTION_KEYS.has(value as EvaluationAgentKey);
  }
}
