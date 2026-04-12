import { Injectable, Logger, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { EvaluationAgentRegistryService } from "./evaluation-agent-registry.service";
import { PipelineStateService } from "./pipeline-state.service";
import { ModelPurpose, PipelinePhase } from "../interfaces/pipeline.interface";
import type {
  EvaluationAgentCompletion,
  EvaluationFallbackReason,
  EvaluationAgentLifecycleEvent,
  EvaluationAgentKey,
  EvaluationPipelineInput,
} from "../interfaces/agent.interface";
import {
  type ClassifiedFile,
  CATEGORY_AGENT_MAP,
  ALL_EVALUATION_AGENTS,
  type DocumentCategory,
} from "../interfaces/document-classification.interface";
import type { EvaluationResult } from "../interfaces/phase-results.interface";
import { EVALUATION_SCHEMAS } from "../schemas";
import { EVALUATION_AGENT_KEYS } from "../constants/agent-keys";
import { AiDebugLogService } from "./ai-debug-log.service";
import { DEFAULT_MODEL_BY_PURPOSE } from "../ai.config";
import { normalizeResearchResult } from "./research-result-normalizer";
import { DrizzleService } from "../../../database";
import { startup } from "../../startup/entities";
import { dataRoom } from "../../startup/entities/data-room.schema";
import { asset } from "../../../storage/entities/asset.schema";

export interface EvaluationRunOptions {
  onAgentStart?: (agent: EvaluationAgentKey) => void;
  onAgentComplete?: (payload: EvaluationAgentCompletion) => void;
  onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void;
  agentKey?: EvaluationAgentKey;
  agentKeys?: EvaluationAgentKey[];
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private pipelineState: PipelineStateService,
    private registry: EvaluationAgentRegistryService,
    private drizzle: DrizzleService,
    @Optional() private aiDebugLog?: AiDebugLogService,
  ) {}

  async run(
    startupId: string,
    options?: EvaluationRunOptions,
  ): Promise<EvaluationResult> {
    const evaluationModel =
      process.env.AI_MODEL_EVALUATION ??
      DEFAULT_MODEL_BY_PURPOSE[ModelPurpose.EVALUATION];

    const handleAgentStart = (agent: EvaluationAgentKey) => {
      options?.onAgentStart?.(agent);
    };

    const handleAgentComplete = (payload: EvaluationAgentCompletion) => {
      void this.aiDebugLog?.logAgentResult({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: payload.agent,
        usedFallback: payload.usedFallback,
        error: payload.error,
        model: evaluationModel,
        output: payload.output,
      });

      options?.onAgentComplete?.(payload);
    };

    const handleAgentLifecycle = (payload: EvaluationAgentLifecycleEvent) => {
      options?.onAgentLifecycle?.(payload);
    };

    const { pipelineInput, agentDocumentMap } = await this.loadPipelineInput(startupId);
    const targetKeys = options?.agentKeys ?? (options?.agentKey ? [options.agentKey] : null);
    if (targetKeys && targetKeys.length > 0) {
      this.logger.log(
        `[Evaluation] Targeted rerun: agents=${targetKeys.join(", ")} | Startup: ${startupId}`,
      );
      let result =
        (await this.pipelineState.getPhaseResult(
          startupId,
          PipelinePhase.EVALUATION,
        )) as EvaluationResult | null;

      this.logger.log(
        `[Evaluation] Dispatching runMany for ${targetKeys.length} agents: [${targetKeys.join(", ")}] | Startup: ${startupId}`,
      );
      const completions = await this.registry.runMany(
        startupId,
        targetKeys,
        pipelineInput,
        handleAgentStart,
        handleAgentComplete,
        handleAgentLifecycle,
        agentDocumentMap,
      );
      this.logger.log(
        `[Evaluation] runMany returned ${completions.length} completions for agents: [${completions.map((c) => c.agent).join(", ")}] | Startup: ${startupId}`,
      );

      for (const rerun of completions) {
        if (!result) {
          result = this.buildSingleAgentResult(rerun);
        } else {
          result = this.mergeAgentResult(result, rerun);
        }
      }

      return result!;
    }

    return this.registry.runAll(
      startupId,
      pipelineInput,
      handleAgentStart,
      handleAgentComplete,
      handleAgentLifecycle,
      agentDocumentMap,
    );
  }

  private async loadPipelineInput(startupId: string): Promise<{
    pipelineInput: EvaluationPipelineInput;
    agentDocumentMap: Map<EvaluationAgentKey, string[]>;
  }> {
    const extraction = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.EXTRACTION,
    );
    const scraping = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.SCRAPING,
    );
    const research = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.RESEARCH,
    );

    if (!extraction || !scraping || !research) {
      throw new Error(
        "Evaluation requires extraction, scraping, and research results",
      );
    }

    const [record] = await this.drizzle.db
      .select({ stage: startup.stage })
      .from(startup)
      .where(eq(startup.id, startupId))
      .limit(1);

    const dataRoomFiles = await this.loadClassifiedDataRoomFiles(startupId);

    if (record?.stage && record.stage !== extraction.stage) {
      this.logger.log(
        `[Evaluation] Stage override: extraction="${extraction.stage}" → db="${record.stage}"`,
      );
      extraction.stage = record.stage;
    }

    const enrichment = await this.pipelineState.getPhaseResult(
      startupId,
      PipelinePhase.ENRICHMENT,
    );

    const { result: normalizedResearch } = normalizeResearchResult(research);

    const agentDocumentMap = this.buildAgentDocumentMap(dataRoomFiles);

    return {
      pipelineInput: { extraction, scraping, research: normalizedResearch, enrichment: enrichment ?? undefined },
      agentDocumentMap,
    };
  }

  private async loadClassifiedDataRoomFiles(
    startupId: string,
  ): Promise<ClassifiedFile[]> {
    const rows = await this.drizzle.db
      .select({
        category: dataRoom.category,
        assetKey: asset.key,
        assetMetadata: asset.metadata,
        assetMimeType: asset.mimeType,
      })
      .from(dataRoom)
      .leftJoin(asset, eq(dataRoom.assetId, asset.id))
      .where(eq(dataRoom.startupId, startupId));

    return rows.map((row) => {
      const metadata = (row.assetMetadata ?? {}) as { originalName?: string };
      return {
        path: row.assetKey ?? "",
        name: metadata.originalName ?? row.assetKey ?? "unknown",
        type: row.assetMimeType ?? "application/octet-stream",
        category: row.category as DocumentCategory,
        confidence: 1,
      };
    });
  }

  private buildAgentDocumentMap(
    files: ClassifiedFile[],
  ): Map<EvaluationAgentKey, string[]> {
    const map = new Map<EvaluationAgentKey, string[]>();
    const fewDocs = files.length <= 2;

    for (const file of files) {
      if (!file.category) continue;
      const agentKeys = fewDocs
        ? ALL_EVALUATION_AGENTS
        : (CATEGORY_AGENT_MAP[file.category as DocumentCategory] ?? []);
      const label = fewDocs
        ? `[${file.category} — shared: only ${files.length} doc${files.length === 1 ? "" : "s"} available] ${file.name}`
        : `[${file.category}] ${file.name}`;
      for (const key of agentKeys) {
        const existing = map.get(key) ?? [];
        existing.push(label);
        map.set(key, existing);
      }
    }

    return map;
  }

  private buildSingleAgentResult(
    rerun: EvaluationAgentCompletion,
  ): EvaluationResult {
    const schema = EVALUATION_SCHEMAS[rerun.agent];
    const parsed = schema.safeParse(rerun.output);
    const result: Record<string, unknown> = {
      [rerun.agent]: parsed.success ? parsed.data : rerun.output,
      summary: {
        failedKeys: rerun.error && !rerun.usedFallback ? [rerun.agent] : [],
        failedAgents: rerun.error && !rerun.usedFallback ? 1 : 0,
        completedAgents: 1,
        fallbackKeys: rerun.usedFallback ? [rerun.agent] : [],
        fallbackAgents: rerun.usedFallback ? 1 : 0,
        fallbackReasonCounts: {},
        errors: rerun.error && !rerun.usedFallback
          ? [{ agent: rerun.agent, error: rerun.error }]
          : [],
        warnings: rerun.usedFallback
          ? [{
              agent: rerun.agent,
              message: rerun.error ?? "Agent returned deterministic fallback output; manual review recommended.",
              ...(rerun.fallbackReason ? { reason: rerun.fallbackReason } : {}),
            }]
          : [],
        minimumRequired: 8,
        degraded: true,
      },
    };
    return result as unknown as EvaluationResult;
  }

  private mergeAgentResult(
    current: EvaluationResult,
    rerun: EvaluationAgentCompletion,
  ): EvaluationResult {
    const next: EvaluationResult = {
      ...current,
      summary: {
        ...current.summary,
        failedKeys: [...current.summary.failedKeys],
        errors: [...current.summary.errors],
        fallbackKeys: [...(current.summary.fallbackKeys ?? [])],
        warnings: [...(current.summary.warnings ?? [])],
        fallbackReasonCounts: { ...(current.summary.fallbackReasonCounts ?? {}) },
      },
    };

    const previousWarning = (next.summary.warnings ?? []).find(
      (entry) => entry.agent === rerun.agent,
    );
    this.updateFallbackReasonCount(
      next.summary.fallbackReasonCounts,
      previousWarning?.reason,
      -1,
    );
    next.summary.errors = next.summary.errors.filter(
      (entry) => entry.agent !== rerun.agent,
    );
    next.summary.warnings = (next.summary.warnings ?? []).filter(
      (entry) => entry.agent !== rerun.agent,
    );

    const schema = EVALUATION_SCHEMAS[rerun.agent];
    const parsed = schema.safeParse(rerun.output);
    (next as unknown as Record<string, unknown>)[rerun.agent] = parsed.success
      ? parsed.data
      : rerun.output;

    const failed = new Set(next.summary.failedKeys);
    const fallback = new Set(next.summary.fallbackKeys ?? []);
    const rerunFallbackReason = rerun.usedFallback
      ? (rerun.fallbackReason ?? "UNHANDLED_AGENT_EXCEPTION")
      : rerun.fallbackReason;
    if (rerun.usedFallback) {
      failed.delete(rerun.agent);
      fallback.add(rerun.agent);
      next.summary.warnings?.push({
        agent: rerun.agent,
        message:
          rerun.error ??
          "Agent returned deterministic fallback output; manual review recommended.",
        ...(rerunFallbackReason ? { reason: rerunFallbackReason } : {}),
      });
      this.updateFallbackReasonCount(
        next.summary.fallbackReasonCounts,
        rerunFallbackReason,
        1,
      );
    } else {
      failed.delete(rerun.agent);
      fallback.delete(rerun.agent);
      if (rerun.error) {
        failed.add(rerun.agent);
        next.summary.errors.push({
          agent: rerun.agent,
          error: rerun.error,
        });
      }
    }

    next.summary.failedKeys = EVALUATION_AGENT_KEYS.filter((key) =>
      failed.has(key),
    );
    next.summary.fallbackKeys = EVALUATION_AGENT_KEYS.filter((key) =>
      fallback.has(key),
    );
    next.summary.failedAgents = next.summary.failedKeys.length;
    next.summary.fallbackAgents = next.summary.fallbackKeys.length;
    next.summary.completedAgents =
      EVALUATION_AGENT_KEYS.length - next.summary.failedAgents;
    next.summary.degraded =
      next.summary.completedAgents < next.summary.minimumRequired ||
      (next.summary.fallbackAgents ?? 0) > 3;

    return next;
  }

  private updateFallbackReasonCount(
    counts: Record<string, number> | undefined,
    reason: EvaluationFallbackReason | undefined,
    delta: number,
  ): void {
    if (!counts || !reason || delta === 0) {
      return;
    }
    const current = counts[reason] ?? 0;
    const next = current + delta;
    if (next <= 0) {
      delete counts[reason];
      return;
    }
    counts[reason] = next;
  }
}
