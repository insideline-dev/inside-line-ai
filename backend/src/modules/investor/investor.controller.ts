import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/decorators';
import { UserRole } from '../../auth/entities/auth.schema';
import { StartupStage } from '../startup/entities/startup.schema';
import { RolesGuard } from '../startup/guards';
import { Roles } from '../startup/decorators/roles.decorator';
import { ThesisService } from './thesis.service';
import { MatchService } from './match.service';
import { TeamService } from './team.service';
import { InvestorNoteService } from './investor-note.service';
import { PortfolioService } from './portfolio.service';
import { DealPipelineService } from './deal-pipeline.service';
import { MessagingService } from './messaging.service';
import { ScoringPreferencesService } from './scoring-preferences.service';
import { DealDecisionService } from './deal-decision.service';
import { RecordDealDecisionDto } from './dto/record-deal-decision.dto';
import { CalibrationService } from './calibration.service';
import { ScreeningQueueService } from './screening-queue.service';
import { ScreeningCalibrationService } from './screening-calibration.service';
import { ScreeningProcessor } from '../ai/processors/screening.processor';
import { PipelineService } from '../ai/services/pipeline.service';
import { ProgressTrackerService } from '../ai/orchestrator/progress-tracker.service';
import { PipelineStateService } from '../ai/services/pipeline-state.service';
import { pipelineRun } from '../ai/entities/pipeline.schema';
import { screeningDecision } from '../ai/entities/screening-decision.schema';
import { PhaseStatus, PipelinePhase, PipelineStatus } from '../ai/interfaces/pipeline.interface';
import { desc, eq } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import { randomBytes } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { CalibrationProposalService } from './calibration-proposal.service';
import {
  ListCalibrationProposalsQueryDto,
  RejectCalibrationProposalDto,
} from './dto/calibration-proposal.dto';
import { ScoringConfigService } from '../admin/scoring-config.service';
import { StartupMatchingPipelineService } from '../ai/services/startup-matching-pipeline.service';
import {
  CreateThesisDto,
  GetMatchesQueryDto,
  CreateTeamInviteDto,
  CreateNoteDto,
  UpdateNoteDto,
  AddPortfolioDto,
  UpdateMatchStatusDto,
  UpdateScoringPreferencesDto,
} from './dto';

type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  image: string | null;
};

@Controller('investor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.INVESTOR, UserRole.ADMIN)
export class InvestorController {
  constructor(
    private thesisService: ThesisService,
    private matchService: MatchService,
    private teamService: TeamService,
    private noteService: InvestorNoteService,
    private portfolioService: PortfolioService,
    private pipelineService: DealPipelineService,
    private messagingService: MessagingService,
    private scoringPreferencesService: ScoringPreferencesService,
    private dealDecisionService: DealDecisionService,
    private calibrationService: CalibrationService,
    private calibrationProposalService: CalibrationProposalService,
    private scoringConfigService: ScoringConfigService,
    private startupMatching: StartupMatchingPipelineService,
    private screeningQueueService: ScreeningQueueService,
    private screeningCalibrationService: ScreeningCalibrationService,
    private screeningProcessor: ScreeningProcessor,
    private pipelineCoreService: PipelineService,
    private progressTracker: ProgressTrackerService,
    private pipelineState: PipelineStateService,
    private drizzle: DrizzleService,
  ) {}

  // ============ THESIS ENDPOINTS ============

  @Get('geography-taxonomy')
  getGeographyTaxonomy() {
    return this.thesisService.getGeographyTaxonomy();
  }

  @Get('thesis')
  async getThesis(@CurrentUser() user: User) {
    return this.thesisService.findOne(user.id);
  }

  @Post('thesis')
  async createOrUpdateThesis(
    @CurrentUser() user: User,
    @Body() dto: CreateThesisDto,
  ) {
    const thesis = await this.thesisService.upsert(user.id, dto);
    await this.matchService.regenerateMatches(user.id);
    return thesis;
  }

  @Post('thesis/generate-summary')
  async generateThesisSummary(@CurrentUser() user: User) {
    return this.thesisService.generateSummary(user.id);
  }

  @Delete('thesis')
  async deleteThesis(@CurrentUser() user: User) {
    await this.thesisService.delete(user.id);
    return { success: true, message: 'Thesis deleted' };
  }

  // ============ DEAL DECISIONS (DS-E11-F1-S1) ============

  @Post('deals/:startupId/decision')
  async recordDealDecision(
    @CurrentUser() user: User,
    @Param('startupId', new ParseUUIDPipe()) startupId: string,
    @Body() body: RecordDealDecisionDto,
  ) {
    return this.dealDecisionService.record(user.id, startupId, body);
  }

  @Get('deals/:startupId/decision')
  async getLatestDealDecision(
    @CurrentUser() user: User,
    @Param('startupId', new ParseUUIDPipe()) startupId: string,
  ) {
    return this.dealDecisionService.latest(user.id, startupId);
  }

  // DS-E7-F3-S1 — calibration aggregates over the investor's own decisions
  // vs the system's triage classifications snapshotted at decision time.
  // Drives the "Calibration" panel on the investor dashboard so the loop
  // visibly closes on each verdict the investor records.
  @Get('calibration')
  async getCalibration(@CurrentUser() user: User) {
    return this.calibrationService.getStatsForInvestor(user.id);
  }

  // ============ CALIBRATION PROPOSALS (DS-E11-F3-S1) ============

  // Lists proposals the recompute job emitted for this investor. v1 only
  // surfaces `status=pending` in the UI; the query param defaults to
  // `pending` so the typical hit `?` query is the right one.
  @Get('calibration/proposals')
  async listCalibrationProposals(
    @CurrentUser() user: User,
    @Query() query: ListCalibrationProposalsQueryDto,
  ) {
    return this.calibrationProposalService.listForInvestor(user.id, query.status);
  }

  @Post('calibration/proposals/:id/approve')
  async approveCalibrationProposal(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.calibrationProposalService.approve(user.id, id);
  }

  @Post('calibration/proposals/:id/reject')
  async rejectCalibrationProposal(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectCalibrationProposalDto,
  ) {
    return this.calibrationProposalService.reject(user.id, id, body.reason);
  }

  // ============ MATCHES ENDPOINTS ============

  @Get('matches')
  async getMatches(
    @CurrentUser() user: User,
    @Query() query: GetMatchesQueryDto,
  ) {
    return this.matchService.findAll(user.id, query);
  }

  @Get('matches/:startupId')
  async getMatchDetails(
    @CurrentUser() user: User,
    @Param('startupId') startupId: string,
  ) {
    try {
      const match = await this.matchService.findOne(user.id, startupId);
      await this.matchService.updateViewedAt(user.id, startupId);
      return match;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  @Patch('matches/:startupId/save')
  async toggleSaved(
    @CurrentUser() user: User,
    @Param('startupId') startupId: string,
  ) {
    return this.matchService.toggleSaved(user.id, startupId);
  }

  @Patch('matches/:matchId/status')
  async updateMatchStatus(
    @CurrentUser() user: User,
    @Param('matchId') matchId: string,
    @Body() dto: UpdateMatchStatusDto,
  ) {
    return this.matchService.updateMatchStatus(user.id, matchId, dto);
  }

  // ============ NOTES ENDPOINTS ============

  @Post('notes')
  async createNote(@CurrentUser() user: User, @Body() dto: CreateNoteDto) {
    return this.noteService.create(user.id, dto);
  }

  @Get('notes')
  async getAllNotes(@CurrentUser() user: User) {
    return this.noteService.getAllNotes(user.id);
  }

  @Get('notes/:startupId')
  async getNotes(@CurrentUser() user: User, @Param('startupId') startupId: string) {
    return this.noteService.getNotes(user.id, startupId);
  }

  @Patch('notes/:noteId')
  async updateNote(
    @CurrentUser() user: User,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.noteService.update(noteId, user.id, dto);
  }

  @Delete('notes/:noteId')
  async deleteNote(@CurrentUser() user: User, @Param('noteId') noteId: string) {
    await this.noteService.delete(noteId, user.id);
    return { success: true, message: 'Note deleted' };
  }

  // ============ PORTFOLIO ENDPOINTS ============

  @Post('portfolio')
  async addToPortfolio(@CurrentUser() user: User, @Body() dto: AddPortfolioDto) {
    return this.portfolioService.addToPortfolio(user.id, dto);
  }

  @Get('portfolio')
  async getPortfolio(@CurrentUser() user: User) {
    return this.portfolioService.getPortfolio(user.id);
  }

  // ============ PIPELINE ENDPOINTS ============

  @Get('pipeline')
  async getPipeline(@CurrentUser() user: User) {
    return this.pipelineService.getPipeline(user.id);
  }

  @Get('screening')
  async getScreeningQueue(@CurrentUser() user: User) {
    return this.screeningQueueService.getQueue(user.id);
  }

  /**
   * Advance a screening REVIEW deal into Due Diligence.
   *
   * Server flow:
   *  1. Override the latest screening_decision row to classification='advance'
   *     so the gate (applyScreeningGate) sees the new verdict.
   *  2. Record the investor's decision (verdict='advance') on the deal
   *     decision log — same surface the rest of the app uses for audit.
   *  3. Re-run the pipeline starting from the EVALUATION phase. The earlier
   *     phases (extraction / enrichment / scraping / research / screening)
   *     stay on the cached results, so we don't redo cheap work — this is
   *     the explicit reuse path the plan calls for.
   */
  @Post('screening/:startupId/advance')
  async advanceFromScreening(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @CurrentUser() user: User,
  ) {
    // 1. Override latest screening verdict.
    const [latest] = await this.drizzle.db
      .select({ id: screeningDecision.id })
      .from(screeningDecision)
      .where(eq(screeningDecision.startupId, startupId))
      .orderBy(desc(screeningDecision.createdAt))
      .limit(1);
    if (!latest) {
      throw new NotFoundException(
        `No screening_decision exists for startup ${startupId}; run screening first.`,
      );
    }
    await this.drizzle.db
      .update(screeningDecision)
      .set({ classification: 'advance' })
      .where(eq(screeningDecision.id, latest.id));

    // 2. Audit the partner's call.
    await this.dealDecisionService.record(user.id, startupId, {
      verdict: 'advance',
      reasonTags: ['screening_review_overridden'],
      notes: undefined,
    });

    // 3. Re-run from EVALUATION when possible (cheapest path — reuses
    //    cached extraction/enrichment/scraping/research/screening), and
    //    fall back to a full pipeline restart when the state isn't usable
    //    (no live state, expired, or upstream phase results missing —
    //    e.g. a previous run was cancelled mid-flight). The gate override
    //    (applyScreeningGate, investor_deal_decision check) ensures that
    //    even in the fresh-restart path, the new screening verdict won't
    //    overrule the partner's ADVANCE intent.
    // Cheap pre-check: rerun-from-eval only works if extraction +
    // scraping + research phase results are still in pipelineState (the
    // evaluation service requires all three). If any is missing — e.g.
    // a previous run was cancelled mid-way — skip straight to the full
    // pipeline path so eval doesn't bomb post-queue with an unhelpful
    // 500.
    const upstreamReady = await (async () => {
      try {
        const [extraction, scraping, research] = await Promise.all([
          this.pipelineState.getPhaseResult(startupId, PipelinePhase.EXTRACTION),
          this.pipelineState.getPhaseResult(startupId, PipelinePhase.SCRAPING),
          this.pipelineState.getPhaseResult(startupId, PipelinePhase.RESEARCH),
        ]);
        return Boolean(extraction && scraping && research);
      } catch {
        return false;
      }
    })();

    let path: 'rerun_from_eval' | 'fresh_full_pipeline' = upstreamReady
      ? 'rerun_from_eval'
      : 'fresh_full_pipeline';
    const tryRerun = async (): Promise<void> => {
      await this.pipelineCoreService.rerunFromPhase(
        startupId,
        PipelinePhase.EVALUATION,
      );
    };
    const tryFreshFull = async (): Promise<void> => {
      await this.pipelineCoreService.startPipeline(startupId, user.id, {
        skipExtraction: true,
      });
      path = 'fresh_full_pipeline';
    };

    if (path === 'rerun_from_eval') {
      try {
        await tryRerun();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isStateMissing = /not found/i.test(message);
        if (!isStateMissing) {
          throw new NotFoundException(
            `Could not start DD from screening — ${message}`,
          );
        }
        try {
          await tryFreshFull();
        } catch (fallbackErr) {
          const fbMsg =
            fallbackErr instanceof Error
              ? fallbackErr.message
              : String(fallbackErr);
          throw new NotFoundException(
            `Could not start DD from screening — ${fbMsg}`,
          );
        }
      }
    } else {
      try {
        await tryFreshFull();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new NotFoundException(
          `Could not start DD from screening — ${message}`,
        );
      }
    }

    return {
      ok: true,
      startupId,
      verdict: 'advance' as const,
      path,
      note:
        path === 'rerun_from_eval'
          ? 'Evaluation + synthesis queued; deal will move to DD when complete.'
          : 'No prior pipeline state — full pipeline restarted; deal will move to DD when complete.',
    };
  }

  /**
   * Pass on a screening REVIEW deal. No DD pipeline trigger — just records
   * the decision and overrides the verdict to 'reject' so the deal drops
   * into the rejected archive.
   */
  @Post('screening/:startupId/pass')
  async passFromScreening(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @CurrentUser() user: User,
    @Body() body?: { reasonTags?: string[]; notes?: string | null },
  ) {
    const [latest] = await this.drizzle.db
      .select({ id: screeningDecision.id })
      .from(screeningDecision)
      .where(eq(screeningDecision.startupId, startupId))
      .orderBy(desc(screeningDecision.createdAt))
      .limit(1);
    if (!latest) {
      throw new NotFoundException(
        `No screening_decision exists for startup ${startupId}`,
      );
    }
    await this.drizzle.db
      .update(screeningDecision)
      .set({ classification: 'reject' })
      .where(eq(screeningDecision.id, latest.id));

    await this.dealDecisionService.record(user.id, startupId, {
      verdict: 'pass',
      reasonTags: body?.reasonTags ?? ['screening_review_pass'],
      notes: body?.notes ?? undefined,
    });

    return { ok: true, startupId, verdict: 'reject' as const };
  }

  /**
   * Screening-side calibration proposals (PR9). Distinct from
   * `/investor/calibration/proposals` which is the DD-side ("worth my
   * money?") loop. This surface answers "worth my time?" — based on
   * screening verdict distribution and lens-reject dominance.
   *
   * Read-only and recomputed on every call.
   */
  @Get('screening/calibration')
  async getScreeningCalibration(@CurrentUser() user: User) {
    return this.screeningCalibrationService.listForInvestor(user.id);
  }

  /**
   * Dev-only: re-run the screening lenses + triage on an existing startup
   * using the data already on file (description, team, classification).
   * Writes a NEW screening_decision row + new startup_lens_result rows
   * keyed off a fresh pipelineRunId. Does NOT trigger the DD pipeline even
   * if the new verdict is ADVANCE — the deal stays where it is and only
   * its screening surface refreshes.
   *
   * Returns 403 in any environment other than development.
   */
  @Post('screening/:startupId/rescreen-dev')
  async rescreenForDev(
    @Param('startupId', ParseUUIDPipe) startupId: string,
    @CurrentUser() _user: User,
  ) {
    if (process.env.NODE_ENV !== 'development') {
      throw new ForbiddenException(
        'rescreen-dev is only available in development environment',
      );
    }
    const pipelineRunId = `rescreen_${randomBytes(8).toString('hex')}`;
    // pipeline_run_id is an FK on screening_decision + startup_lens_result —
    // we have to create the parent row before runScreening can persist
    // lens results / triage decision. Status COMPLETED so it doesn't get
    // picked up as a hung pipeline by health probes.
    await this.drizzle.db.insert(pipelineRun).values({
      pipelineRunId,
      startupId,
      userId: _user.id,
      status: PipelineStatus.COMPLETED,
      config: { source: 'rescreen-dev' },
      startedAt: new Date(),
      completedAt: new Date(),
    });

    // Fix 7 (post-audit): seed the live-progress payload so the admin DS
    // pipeline view shows upstream phases as "cached/completed" rather
    // than stalling on "pending". Rescreen-dev intentionally re-runs only
    // the SCREENING phase — the earlier phases are reused from the original
    // pipeline run. We mark them COMPLETED for the UI and SCREENING as
    // RUNNING so the user sees the right state.
    // DS phases only — research/evaluation/synthesis are DD-only and
    // intentionally not part of the screening live view. The lens agents
    // (market/team/traction) do their own light research inside the
    // SCREENING phase.
    try {
      await this.progressTracker.initProgress({
        startupId,
        userId: _user.id,
        pipelineRunId,
        phases: [
          PipelinePhase.CLASSIFICATION,
          PipelinePhase.EXTRACTION,
          PipelinePhase.ENRICHMENT,
          PipelinePhase.SCRAPING,
          PipelinePhase.SCREENING,
        ],
        initialPhaseStatuses: {
          [PipelinePhase.CLASSIFICATION]: PhaseStatus.COMPLETED,
          [PipelinePhase.EXTRACTION]: PhaseStatus.COMPLETED,
          [PipelinePhase.ENRICHMENT]: PhaseStatus.COMPLETED,
          [PipelinePhase.SCRAPING]: PhaseStatus.COMPLETED,
          [PipelinePhase.SCREENING]: PhaseStatus.RUNNING,
        },
        currentPhase: PipelinePhase.SCREENING,
      });
    } catch (err) {
      // Non-fatal — progress seeding is UX-only; rescreen still runs.
      // (Lens-level events are still emitted from runScreening below.)
      void err;
    }

    const result = await this.screeningProcessor.runScreening(
      startupId,
      pipelineRunId,
      { userId: _user.id },
    );

    // Mark SCREENING phase complete for the live view.
    try {
      await this.progressTracker.updatePhaseProgress({
        startupId,
        userId: _user.id,
        pipelineRunId,
        phase: PipelinePhase.SCREENING,
        status: PhaseStatus.COMPLETED,
      });
    } catch (err) {
      void err;
    }

    return {
      ok: true,
      pipelineRunId,
      classification: result.classification ?? null,
      overallScore: result.overallScore ?? null,
      lensCount: result.lenses.length,
      note:
        'Re-screen complete. Deal not auto-advanced; the DD pipeline was NOT triggered.',
    };
  }

  @Post('startups/:id/match')
  async triggerStartupMatching(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.startupMatching.queueStartupMatching({
      startupId: id,
      requestedBy: user.id,
      triggerSource: 'manual',
      requireApproved: false,
    });
  }

  @Get('startups/:id/matching/status')
  async getStartupMatchingStatus(@Param('id') id: string) {
    return this.startupMatching.getLatestMatchingStatus(id);
  }

  // ============================================================================
  // AI PLACEHOLDERS
  // ============================================================================

  // AI_PLACEHOLDER
  @Get('messaging/conversations')
  async getConversations() {
    return this.messagingService.getConversations();
  }

  // ============ SCORING PREFERENCES ENDPOINTS ============

  @Get('scoring/defaults')
  async getScoringDefaults() {
    return this.scoringConfigService.getAll();
  }

  @Get('scoring/preferences')
  async getScoringPreferences(@CurrentUser() user: User) {
    return this.scoringPreferencesService.getAll(user.id);
  }

  @Get('scoring/preferences/:stage')
  async getScoringPreferenceByStage(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
  ) {
    const pref = await this.scoringPreferencesService.getByStage(user.id, stage);
    if (!pref) {
      throw new NotFoundException(`No scoring preference found for stage ${stage}`);
    }
    return pref;
  }

  @Get('scoring/effective/:stage')
  async getEffectiveWeights(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
  ) {
    return this.scoringPreferencesService.getEffectiveWeights(user.id, stage);
  }

  @Put('scoring/preferences/:stage')
  async updateScoringPreference(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
    @Body() dto: UpdateScoringPreferencesDto,
  ) {
    const preference = await this.scoringPreferencesService.upsert(
      user.id,
      stage,
      dto,
    );
    await this.matchService.regenerateMatches(user.id);
    return preference;
  }

  @Delete('scoring/preferences/:stage')
  async resetScoringPreference(
    @CurrentUser() user: User,
    @Param('stage') stage: StartupStage,
  ) {
    await this.scoringPreferencesService.reset(user.id, stage);
    await this.matchService.regenerateMatches(user.id);
    return { success: true, message: 'Scoring preference reset to defaults' };
  }

  @Delete('scoring/preferences')
  async resetAllScoringPreferences(@CurrentUser() user: User) {
    await this.scoringPreferencesService.resetAll(user.id);
    await this.matchService.regenerateMatches(user.id);
    return { success: true, message: 'All scoring preferences reset to defaults' };
  }

  // ============ TEAM ENDPOINTS ============

  @Get('team')
  async getTeam(@CurrentUser() user: User) {
    return this.teamService.getTeam(user.id);
  }

  @Post('team/invite')
  async createTeamInvite(
    @CurrentUser() user: User,
    @Body() dto: CreateTeamInviteDto,
  ) {
    return this.teamService.createInvite(user.id, dto);
  }

  @Delete('team/invite/:id')
  async cancelInvite(@CurrentUser() user: User, @Param('id') inviteId: string) {
    await this.teamService.cancelInvite(user.id, inviteId);
    return { success: true, message: 'Invite cancelled' };
  }

  @Delete('team/member/:id')
  async removeMember(@CurrentUser() user: User, @Param('id') memberId: string) {
    await this.teamService.removeMember(user.id, memberId);
    return { success: true, message: 'Member removed' };
  }
}

// ============================================================================
// PUBLIC ENDPOINTS (No RolesGuard)
// ============================================================================

@Controller('investor/team')
@UseGuards(JwtAuthGuard)
export class InvestorTeamPublicController {
  constructor(private teamService: TeamService) {}

  @Post('join/:inviteCode')
  async acceptInvite(
    @CurrentUser() user: User,
    @Param('inviteCode') inviteCode: string,
  ) {
    return this.teamService.acceptInvite(user.id, inviteCode);
  }
}
