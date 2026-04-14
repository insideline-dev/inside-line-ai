import { Inject, Injectable, Logger, Optional, forwardRef } from "@nestjs/common";
import type {
  EvaluationAgent,
  EvaluationAgentCompletion,
  EvaluationFallbackReason,
  EvaluationAgentLifecycleEvent,
  EvaluationFeedbackNote,
  EvaluationAgentKey,
  EvaluationPipelineInput,
  EvaluationAgentTraceEvent,
  EvaluationAgentPollingState,
  EvaluationAgentPollResult,
  EvaluationAgentStartResult,
} from "../interfaces/agent.interface";
import type {
  EvaluationResult,
  EvaluationSummary,
} from "../interfaces/phase-results.interface";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "./pipeline-state.service";
import { PhaseTransitionService } from "../orchestrator/phase-transition.service";
import { PipelineFeedbackService } from "./pipeline-feedback.service";
import { PipelineAgentTraceService } from "./pipeline-agent-trace.service";
import {
  BusinessModelEvaluationAgent,
  CompetitiveAdvantageEvaluationAgent,
  DealTermsEvaluationAgent,
  ExitPotentialEvaluationAgent,
  FinancialsEvaluationAgent,
  GtmEvaluationAgent,
  LegalEvaluationAgent,
  MarketEvaluationAgent,
  ProductEvaluationAgent,
  TeamEvaluationAgent,
  TractionEvaluationAgent,
} from "../agents/evaluation";
import { AgentConfigService } from "./agent-config.service";
import { DynamicAgentRunnerService } from "./dynamic-agent-runner.service";
import {
  EvaluationInputResolverService,
  type ResolvedEvaluationInput,
} from "./evaluation-input-resolver.service";
import { AiConfigService } from "./ai-config.service";
import { PipelineFlowConfigService } from "./pipeline-flow-config.service";
import type { PipelineFlowNodeConfigs } from "./pipeline-graph-compiler.service";

type PersistedEvaluationTraceEvent = EvaluationAgentTraceEvent & {
  meta?: Record<string, unknown>;
};

interface EvaluationAgentPreparedRun {
  agent: EvaluationAgent<unknown>;
  input: ResolvedEvaluationInput;
  dataSummary?: Record<string, unknown>;
  feedbackNotes: EvaluationFeedbackNote[];
  config: { webSearchEnabled: boolean; braveSearchEnabled: boolean };
}

@Injectable()
export class EvaluationAgentRegistryService {
  private readonly logger = new Logger(EvaluationAgentRegistryService.name);

  private readonly agents: Array<EvaluationAgent<unknown>>;
  private readonly builtInAgentsByKey: Record<string, EvaluationAgent<unknown>>;

  constructor(
    private team: TeamEvaluationAgent,
    private market: MarketEvaluationAgent,
    private product: ProductEvaluationAgent,
    private traction: TractionEvaluationAgent,
    private businessModel: BusinessModelEvaluationAgent,
    private gtm: GtmEvaluationAgent,
    private financials: FinancialsEvaluationAgent,
    private competitiveAdvantage: CompetitiveAdvantageEvaluationAgent,
    private legal: LegalEvaluationAgent,
    private dealTerms: DealTermsEvaluationAgent,
    private exitPotential: ExitPotentialEvaluationAgent,
    private pipelineState: PipelineStateService,
    private phaseTransition: PhaseTransitionService,
    private pipelineFeedback: PipelineFeedbackService,
    private agentConfigService: AgentConfigService,
    private dynamicAgentRunner: DynamicAgentRunnerService,
    @Optional() private pipelineAgentTrace?: PipelineAgentTraceService,
    @Optional() private evaluationInputResolver?: EvaluationInputResolverService,
    @Optional() private aiConfig?: AiConfigService,
    @Optional() @Inject(forwardRef(() => PipelineFlowConfigService)) private flowConfigService?: PipelineFlowConfigService,
  ) {
    this.agents = [
      this.team,
      this.market,
      this.product,
      this.traction,
      this.businessModel,
      this.gtm,
      this.financials,
      this.competitiveAdvantage,
      this.legal,
      this.dealTerms,
      this.exitPotential,
    ];
    this.builtInAgentsByKey = Object.fromEntries(
      this.agents.map((agent) => [agent.key, agent]),
    );
  }

  async runAll(
    startupId: string,
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationResult> {
    const resolvedAgents = await this.resolveAgents();
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const outputs = new Map<EvaluationAgentKey, unknown>();
    const failedKeys: EvaluationAgentKey[] = [];
    const errors: Array<{ agent: string; error: string }> = [];
    const fallbackKeys: EvaluationAgentKey[] = [];
    const warnings: Array<{ agent: string; message: string }> = [];
    const fallbackReasonCounts: Partial<Record<EvaluationFallbackReason, number>> = {};
    const evaluationAgentStaggerMs = Math.max(
      0,
      this.aiConfig?.getEvaluationAgentStaggerMs() ?? 0,
    );
    const phaseRetryCount = 0;

    const preparedRuns = await Promise.all(
      resolvedAgents.map(async (agent) => ({
        key: agent.key,
        prepared: await this.prepareAgentRun(
          startupId,
          agent.key,
          pipelineData,
          agentDocumentMap,
        ),
      })),
    );

    // ── Classify agents into pollable vs blocking ──────────────────
    const INITIAL_CONCURRENCY = 5;
    const pollableQueue: Array<{
      key: EvaluationAgentKey;
      prepared: EvaluationAgentPreparedRun;
    }> = [];
    const blockingQueue: Array<{
      key: EvaluationAgentKey;
      prepared: EvaluationAgentPreparedRun;
    }> = [];

    for (const { key, prepared } of preparedRuns) {
      const supportsPolling =
        prepared.agent.supportsDirectPolling();
      if (supportsPolling) {
        pollableQueue.push({ key, prepared });
      } else {
        blockingQueue.push({ key, prepared });
      }
    }

    this.logger.log(
      `[runAll] Startup ${startupId}: ${pollableQueue.length} agents pollable, ${blockingQueue.length} agents blocking, concurrency=${INITIAL_CONCURRENCY}`,
    );

    const collectCompletion = (completion: EvaluationAgentCompletion) => {
      outputs.set(completion.agent, completion.output);
      const normalizedFallbackReason = completion.usedFallback
        ? (completion.fallbackReason ?? "UNHANDLED_AGENT_EXCEPTION")
        : completion.fallbackReason;

      if (completion.usedFallback) {
        fallbackKeys.push(completion.agent);
        warnings.push({
          agent: completion.agent,
          message:
            completion.error ??
            "Agent returned deterministic fallback output; manual review recommended.",
          ...(normalizedFallbackReason
            ? { reason: normalizedFallbackReason }
            : {}),
        });
        this.bumpFallbackReasonCount(
          fallbackReasonCounts,
          normalizedFallbackReason,
        );
      } else if (completion.error) {
        failedKeys.push(completion.agent);
        errors.push({ agent: completion.agent, error: completion.error });
      }
    };

    // ── Run blocking agents + concurrency-limited poll loop in parallel ─
    const blockingPromise = Promise.all(
      blockingQueue.map(async ({ prepared }) => {
        const completion = await this.runPreparedAgent(
          startupId,
          pipelineRunId,
          prepared,
          onAgentStart,
          onAgentComplete,
          onAgentLifecycle,
        );
        collectCompletion(completion);
      }),
    );

    const pollingPromise = this.runConcurrencyPoolPolling(
      startupId,
      pipelineData,
      pipelineRunId,
      pollableQueue,
      INITIAL_CONCURRENCY,
      phaseRetryCount,
      evaluationAgentStaggerMs,
      onAgentStart,
      onAgentComplete,
      onAgentLifecycle,
      agentDocumentMap,
      collectCompletion,
    );

    await Promise.all([blockingPromise, pollingPromise]);

    for (const agent of this.agents) {
      if (!outputs.has(agent.key)) {
        this.logger.error(
          `Evaluation agent "${agent.key}" produced no output for startup ${startupId} — generating fallback`,
        );
        outputs.set(agent.key, agent.fallback(pipelineData));
        failedKeys.push(agent.key);
        errors.push({ agent: agent.key, error: "Agent produced no output; fallback generated post-hoc" });
      }
    }

    const completedAgents = resolvedAgents.length - failedKeys.length;
    const minimumRequired = this.phaseTransition.getConfig().minimumEvaluationAgents;
    const fallbackAgents = fallbackKeys.length;
    const summary: EvaluationSummary = {
      completedAgents,
      failedAgents: failedKeys.length,
      minimumRequired,
      failedKeys,
      errors,
      fallbackAgents,
      fallbackKeys,
      warnings,
      fallbackReasonCounts,
      degraded: completedAgents < minimumRequired || fallbackAgents > 3,
    };

    if (summary.degraded) {
      this.logger.warn(
          `Evaluation completed in degraded mode for startup ${startupId}: ${completedAgents}/${resolvedAgents.length} completed, ${fallbackAgents} fallback`,
        );
    }

    return {
      team: outputs.get("team") as EvaluationResult["team"],
      market: outputs.get("market") as EvaluationResult["market"],
      product: outputs.get("product") as EvaluationResult["product"],
      traction: outputs.get("traction") as EvaluationResult["traction"],
      businessModel: outputs.get("businessModel") as EvaluationResult["businessModel"],
      gtm: outputs.get("gtm") as EvaluationResult["gtm"],
      financials: outputs.get("financials") as EvaluationResult["financials"],
      competitiveAdvantage: outputs.get("competitiveAdvantage") as EvaluationResult["competitiveAdvantage"],
      legal: outputs.get("legal") as EvaluationResult["legal"],
      dealTerms: outputs.get("dealTerms") as EvaluationResult["dealTerms"],
      exitPotential: outputs.get("exitPotential") as EvaluationResult["exitPotential"],
      summary,
    };
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Concurrency-pool polling: submits up to `maxConcurrent` agents at once,
   * polls all in-flight in a single loop, and flood-fills — each time one
   * completes, the next waiting agent is submitted immediately.
   *
   * This keeps ≤5 concurrent OpenAI background requests at any time, reducing
   * API rate-limit pressure while keeping throughput high.
   */
  private async runConcurrencyPoolPolling(
    startupId: string,
    pipelineData: EvaluationPipelineInput,
    pipelineRunId: string | undefined,
    pollableQueue: Array<{
      key: EvaluationAgentKey;
      prepared: EvaluationAgentPreparedRun;
    }>,
    maxConcurrent: number,
    phaseRetryCount: number,
    staggerMs: number,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
    collectCompletion?: (completion: EvaluationAgentCompletion) => void,
  ): Promise<void> {
    if (pollableQueue.length === 0) {
      return;
    }

    const POLL_INTERVAL_MS = 60_000; // 1 minute — gentle on the server
    const AGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours — let OpenAI respond

    const waiting = [...pollableQueue];
    const inflight = new Map<
      EvaluationAgentKey,
      {
        state: EvaluationAgentPollingState;
        prepared: EvaluationAgentPreparedRun;
        startedAtMs: number;
      }
    >();

    const submitNext = async (): Promise<void> => {
      const next = waiting.shift();
      if (!next) return;

      const { key, prepared } = next;
      try {
        const startResult = await this.startOpenAiPollingRun(
          startupId,
          key,
          pipelineData,
          phaseRetryCount,
          onAgentStart,
          onAgentLifecycle,
          agentDocumentMap,
        );
        inflight.set(key, {
          prepared,
          startedAtMs: Date.now(),
          state: {
            agent: key,
            responseId: startResult.responseId,
            status: startResult.resumed ? "resumed" : "queued",
            modelName: startResult.modelName,
            pollIntervalMs: startResult.pollIntervalMs,
            startedAt: startResult.startedAt,
            phaseRetryCount,
            agentAttemptId: pipelineRunId
              ? `${pipelineRunId}:${PipelinePhase.EVALUATION}:${key}:phase-${phaseRetryCount}:attempt-1`
              : undefined,
          },
        });
        this.logger.log(
          `[runAll] Agent "${key}" submitted (responseId=${startResult.responseId}). inflight=${inflight.size}, waiting=${waiting.length}`,
        );
      } catch (submitError) {
        const msg = submitError instanceof Error ? submitError.message : String(submitError);
        this.logger.error(
          `[runAll] Agent "${key}" failed to submit: ${msg}. Running blocking fallback.`,
        );
        const completion = await this.runPreparedAgent(
          startupId,
          pipelineRunId,
          prepared,
          onAgentStart,
          onAgentComplete,
          onAgentLifecycle,
        );
        collectCompletion?.(completion);
      }
    };

    // ── Seed the pool with initial batch (staggered) ─────────────
    const initialBatch = Math.min(maxConcurrent, waiting.length);
    for (let i = 0; i < initialBatch; i++) {
      if (i > 0 && staggerMs > 0) {
        await this.sleep(staggerMs);
      }
      await submitNext();
    }

    // ── Polling loop with flood-fill ─────────────────────────────
    while (inflight.size > 0) {
      for (const [key, entry] of inflight) {
        // 2-hour per-agent safety net — if OpenAI hasn't responded in 2 hours, it's not going to
        if (Date.now() - entry.startedAtMs > AGENT_TIMEOUT_MS) {
          this.logger.warn(
            `[runAll] Agent "${key}" timed out after ${Math.round(AGENT_TIMEOUT_MS / 60_000)}min. Generating fallback.`,
          );
          const fallbackOutput = entry.prepared.agent.fallback(entry.prepared.input.pipelineData);
          const completion: EvaluationAgentCompletion = {
            agent: key,
            output: fallbackOutput,
            usedFallback: true,
            attempt: 1,
            retryCount: 0,
            error: `Agent timed out after ${Math.round(AGENT_TIMEOUT_MS / 60_000)} minutes`,
            fallbackReason: "TIMEOUT",
            rawProviderError: `Agent timed out after ${Math.round(AGENT_TIMEOUT_MS / 60_000)} minutes`,
          };
          this.emitAgentCompletion(onAgentComplete, completion);
          collectCompletion?.(completion);
          inflight.delete(key);
          if (waiting.length > 0) await submitNext();
          continue;
        }

        try {
          const pollResult = await this.pollOpenAiRun(
            startupId,
            key,
            pipelineData,
            entry.state,
            onAgentComplete,
            onAgentLifecycle,
            agentDocumentMap,
          );

          entry.state = {
            ...entry.state,
            status: pollResult.status,
            pollIntervalMs: pollResult.pollIntervalMs,
          };

          if (pollResult.status !== "running") {
            if (pollResult.completion) {
              collectCompletion?.(pollResult.completion);
            } else {
              const fallbackOutput = entry.prepared.agent.fallback(entry.prepared.input.pipelineData);
              const completion: EvaluationAgentCompletion = {
                agent: key,
                output: fallbackOutput,
                usedFallback: true,
                attempt: 1,
                retryCount: 0,
                error: `Agent "${key}" reached terminal status "${pollResult.status}" without completion`,
                fallbackReason: "UNHANDLED_AGENT_EXCEPTION",
              };
              this.emitAgentCompletion(onAgentComplete, completion);
              collectCompletion?.(completion);
            }
            inflight.delete(key);
            this.logger.log(
              `[runAll] Agent "${key}" done (status=${pollResult.status}). inflight=${inflight.size}, waiting=${waiting.length}`,
            );
            if (waiting.length > 0) await submitNext();
          }
        } catch (pollError) {
          const msg = pollError instanceof Error ? pollError.message : String(pollError);
          this.logger.error(`[runAll] Polling error for "${key}": ${msg}. Generating fallback.`);
          const fallbackOutput = entry.prepared.agent.fallback(entry.prepared.input.pipelineData);
          const completion: EvaluationAgentCompletion = {
            agent: key,
            output: fallbackOutput,
            usedFallback: true,
            attempt: 1,
            retryCount: 0,
            error: msg,
            fallbackReason: "UNHANDLED_AGENT_EXCEPTION",
            rawProviderError: msg,
          };
          this.emitAgentCompletion(onAgentComplete, completion);
          collectCompletion?.(completion);
          inflight.delete(key);
          if (waiting.length > 0) await submitNext();
        }
      }

      if (inflight.size > 0) {
        this.logger.debug(
          `[runAll] ${inflight.size} agents polling, ${waiting.length} waiting. Next poll in ${POLL_INTERVAL_MS / 1000}s.`,
        );
        await this.sleep(POLL_INTERVAL_MS);
      }
    }
  }

  async startOpenAiPollingRun(
    startupId: string,
    key: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    phaseRetryCount: number,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationAgentStartResult> {
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const prepared = await this.prepareAgentRun(
      startupId,
      key,
      pipelineData,
      agentDocumentMap,
    );
    if (!prepared.agent.supportsDirectPolling()) {
      throw new Error(`Evaluation agent "${key}" does not support direct polling`);
    }

    this.emitAgentStart(onAgentStart, key);
    const startResult = await prepared.agent.startDirectRun!(
      prepared.input.pipelineData,
      {
        feedbackNotes: prepared.feedbackNotes,
        pipelineRunId,
        ...prepared.config,
        onLifecycle: (event) => this.emitAgentLifecycle(onAgentLifecycle, event),
        onTrace: (event) => {
          void this.persistAgentTrace(startupId, pipelineRunId, event);
        },
      },
    );

    return {
      ...startResult,
      dataSummary: prepared.dataSummary,
    };
  }

  async pollOpenAiRun(
    startupId: string,
    key: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    state: EvaluationAgentPollingState,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationAgentPollResult> {
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const prepared = await this.prepareAgentRun(
      startupId,
      key,
      pipelineData,
      agentDocumentMap,
    );
    if (!prepared.agent.supportsDirectPolling()) {
      throw new Error(`Evaluation agent "${key}" does not support direct polling`);
    }

    const traceWrites: Promise<void>[] = [];
    const result = await prepared.agent.pollDirectRun!(
      prepared.input.pipelineData,
      state,
      {
        feedbackNotes: prepared.feedbackNotes,
        pipelineRunId,
        ...prepared.config,
        onLifecycle: (event) => this.emitAgentLifecycle(onAgentLifecycle, event),
        onTrace: (event) => {
          traceWrites.push(this.persistAgentTrace(startupId, pipelineRunId, event));
        },
      },
    );
    await Promise.allSettled(traceWrites);

    if (result.completion) {
      const completion: EvaluationAgentCompletion = {
        ...result.completion,
        ...(prepared.dataSummary ? { dataSummary: prepared.dataSummary } : {}),
      };
      this.emitAgentCompletion(onAgentComplete, completion);
      result.completion = completion;
      if (!completion.usedFallback) {
        await this.consumeAgentFeedback(startupId, key);
      }
    }

    return result;
  }

  async runOne(
    startupId: string,
    key: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationAgentCompletion> {
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const prepared = await this.prepareAgentRun(
      startupId,
      key,
      pipelineData,
      agentDocumentMap,
    );

    const completion = await this.runPreparedAgent(
      startupId,
      pipelineRunId,
      prepared,
      onAgentStart,
      undefined,
      onAgentLifecycle,
    );

    if (!completion.usedFallback) {
      await this.consumePhaseFeedback(startupId);
    }

    return completion;
  }

  /**
   * Run a subset of agents through the same concurrency-pool pattern as runAll.
   * Used for targeted retries so they get unified polling instead of N blocking calls.
   */
  async runMany(
    startupId: string,
    keys: EvaluationAgentKey[],
    pipelineData: EvaluationPipelineInput,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationAgentCompletion[]> {
    const pipelineRunId = (await this.pipelineState.get(startupId))?.pipelineRunId;
    const RETRY_CONCURRENCY = 5;
    const staggerMs = Math.max(
      0,
      this.aiConfig?.getEvaluationAgentStaggerMs() ?? 0,
    );
    const completions: EvaluationAgentCompletion[] = [];

    const preparedRuns = await Promise.all(
      keys.map(async (key) => ({
        key,
        prepared: await this.prepareAgentRun(startupId, key, pipelineData, agentDocumentMap),
      })),
    );

    const pollableQueue: Array<{
      key: EvaluationAgentKey;
      prepared: EvaluationAgentPreparedRun;
    }> = [];
    const blockingQueue: Array<{
      key: EvaluationAgentKey;
      prepared: EvaluationAgentPreparedRun;
    }> = [];

    for (const { key, prepared } of preparedRuns) {
      const supportsPolling =
        prepared.agent.supportsDirectPolling();
      if (supportsPolling) {
        pollableQueue.push({ key, prepared });
      } else {
        blockingQueue.push({ key, prepared });
      }
    }

    this.logger.log(
      `[runMany] Startup ${startupId}: ${keys.length} agents targeted, ${pollableQueue.length} pollable, ${blockingQueue.length} blocking`,
    );

    const collect = (completion: EvaluationAgentCompletion) => {
      completions.push(completion);
    };

    // Pre-fire onAgentStart for all pollable agents immediately so the UI shows them
    // all as "running" at once. runConcurrencyPoolPolling submits agents sequentially
    // (one HTTP call at a time), so without this pre-fire only the first agent would
    // appear as running while others wait for the queue to process them.
    // Blocking agents already fire concurrently via Promise.all below.
    this.logger.log(
      `[runMany] PRE-FIRING onAgentStart for ${pollableQueue.length} pollable agents: [${pollableQueue.map((p) => p.key).join(", ")}]`,
    );
    for (const { key } of pollableQueue) {
      this.emitAgentStart(onAgentStart, key);
    }

    const blockingPromise = Promise.all(
      blockingQueue.map(async ({ prepared }) => {
        const completion = await this.runPreparedAgent(
          startupId,
          pipelineRunId,
          prepared,
          onAgentStart,
          onAgentComplete,
          onAgentLifecycle,
        );
        collect(completion);
      }),
    );

    const pollingPromise = this.runConcurrencyPoolPolling(
      startupId,
      pipelineData,
      pipelineRunId,
      pollableQueue,
      RETRY_CONCURRENCY,
      0, // phaseRetryCount
      staggerMs,
      undefined, // onAgentStart — already pre-fired above for all pollable agents
      onAgentComplete,
      onAgentLifecycle,
      agentDocumentMap,
      collect,
    );

    await Promise.all([blockingPromise, pollingPromise]);

    return completions;
  }

  private async resolveAgents(): Promise<Array<EvaluationAgent<unknown>>> {
    const configs = await this.agentConfigService.getExecutableByOrchestrator(
      "evaluation_orchestrator",
      "pipeline",
    );

    if (configs.length === 0) {
      return this.agents;
    }

    const resolved: Array<EvaluationAgent<unknown>> = [];

    for (const entry of configs) {
      const { config, promptKey } = entry;

      if (!config.isCustom) {
        const builtIn = this.builtInAgentsByKey[config.agentKey];
        if (builtIn) {
          resolved.push(builtIn);
        }
        continue;
      }

      if (!promptKey) {
        continue;
      }

      resolved.push({
        key: config.agentKey as EvaluationAgentKey,
        supportsDirectPolling: () => false,
        run: async (pipelineData, options) => {
          const result = await this.dynamicAgentRunner.run({
            agentKey: config.agentKey,
            promptKey,
            pipelineData,
            stage: pipelineData.extraction.stage as never,
          });
          options?.onTrace?.({
            agent: config.agentKey as EvaluationAgentKey,
            status: result.usedFallback ? "fallback" : "completed",
            inputPrompt: result.inputPrompt,
            systemPrompt: result.systemPrompt,
            outputText: result.outputText,
            outputJson: result.output,
            attempt: result.attempt,
            retryCount: result.retryCount,
            usedFallback: result.usedFallback,
            error: result.error,
            fallbackReason: result.usedFallback
              ? "UNHANDLED_AGENT_EXCEPTION"
              : undefined,
            rawProviderError: result.error,
          });
          return {
            key: result.key as EvaluationAgentKey,
            output: result.output,
            usedFallback: result.usedFallback,
            error: result.error,
            attempt: result.attempt,
            retryCount: result.retryCount,
            fallbackReason: result.usedFallback
              ? "UNHANDLED_AGENT_EXCEPTION"
              : undefined,
            rawProviderError: result.error,
          };
        },
        fallback: () => ({}),
      });
    }

    return resolved.length > 0 ? resolved : this.agents;
  }

  private async prepareAgentRun(
    startupId: string,
    key: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<EvaluationAgentPreparedRun> {
    const resolvedAgents = await this.resolveAgents();
    const agent = resolvedAgents.find((candidate) => candidate.key === key);
    if (!agent) {
      throw new Error(`Unsupported evaluation agent "${key}"`);
    }

    const resolvedInput = await this.resolvePipelineInputForAgent(
      key,
      pipelineData,
      agentDocumentMap,
    );
    const dataSummary = this.buildInputDataSummary(resolvedInput);
    const feedbackNotes = await this.loadFeedbackNotes(startupId, key);
    const nodeConfigs = await this.loadNodeConfigs();
    const config = this.getEvalAgentConfig(nodeConfigs, key);

    return {
      agent,
      input: resolvedInput,
      dataSummary,
      feedbackNotes,
      config,
    };
  }

  private getEvalAgentConfig(
    nodeConfigs: PipelineFlowNodeConfigs | undefined,
    agentKey: string,
  ): { webSearchEnabled: boolean; braveSearchEnabled: boolean } {
    const config = nodeConfigs?.[`evaluation_${agentKey}`];
    if (typeof config !== "object" || config === null) {
      return { webSearchEnabled: false, braveSearchEnabled: false };
    }
    const candidate = config as {
      webSearchEnabled?: boolean;
      braveSearchEnabled?: boolean;
    };
    return {
      webSearchEnabled: candidate.webSearchEnabled === true,
      braveSearchEnabled: candidate.braveSearchEnabled === true,
    };
  }

  private async runPreparedAgent(
    startupId: string,
    pipelineRunId: string | undefined,
    prepared: EvaluationAgentPreparedRun,
    onAgentStart?: (agent: EvaluationAgentKey) => void,
    onAgentComplete?: (payload: EvaluationAgentCompletion) => void,
    onAgentLifecycle?: (payload: EvaluationAgentLifecycleEvent) => void,
  ): Promise<EvaluationAgentCompletion> {
    const traceWrites: Promise<void>[] = [];
    const startedAt = new Date();
    this.emitAgentStart(onAgentStart, prepared.agent.key);

    try {
      const result = await prepared.agent.run(prepared.input.pipelineData, {
        feedbackNotes: prepared.feedbackNotes,
        pipelineRunId,
        ...prepared.config,
        onLifecycle: (event) => this.emitAgentLifecycle(onAgentLifecycle, event),
        onTrace: (event) => {
          traceWrites.push(this.persistAgentTrace(startupId, pipelineRunId, event));
        },
      });
      const completedAt = new Date();

      await this.recordTelemetrySafely(startupId, {
        agentKey: result.key,
        phase: PipelinePhase.EVALUATION,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        retryCount: result.retryCount ?? 0,
      });

      if (!result.usedFallback) {
        await this.consumeAgentFeedback(startupId, prepared.agent.key);
      }

      await Promise.allSettled(traceWrites);
      const completion: EvaluationAgentCompletion = {
        agent: result.key,
        output: result.output,
        usedFallback: result.usedFallback,
        ...(prepared.dataSummary ? { dataSummary: prepared.dataSummary } : {}),
        ...(typeof result.attempt === "number" ? { attempt: result.attempt } : {}),
        ...(typeof result.retryCount === "number"
          ? { retryCount: result.retryCount }
          : {}),
        error: result.error,
        fallbackReason: result.usedFallback
          ? (result.fallbackReason ?? "UNHANDLED_AGENT_EXCEPTION")
          : result.fallbackReason,
        rawProviderError: result.rawProviderError,
        meta: result.meta,
      };
      this.emitAgentCompletion(onAgentComplete, completion);
      return completion;
    } catch (error) {
      const completedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      const fallbackReason: EvaluationFallbackReason =
        "UNHANDLED_AGENT_EXCEPTION";
      this.emitAgentLifecycle(onAgentLifecycle, {
        agent: prepared.agent.key,
        event: "fallback",
        attempt: 1,
        retryCount: 0,
        error: message,
        fallbackReason,
        rawProviderError: message,
      });
      await this.recordTelemetrySafely(startupId, {
        agentKey: prepared.agent.key,
        phase: PipelinePhase.EVALUATION,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        retryCount: 0,
      });
      const fallbackOutput = prepared.agent.fallback(prepared.input.pipelineData);
      traceWrites.push(
        this.persistAgentTrace(startupId, pipelineRunId, {
          agent: prepared.agent.key,
          status: "fallback",
          inputPrompt: "",
          systemPrompt: "",
          outputText: this.safeStringify(fallbackOutput),
          outputJson: fallbackOutput,
          attempt: 1,
          retryCount: 0,
          usedFallback: true,
          error: message,
          fallbackReason,
          rawProviderError: message,
          meta: this.buildUnhandledErrorMeta(error),
        }),
      );
      await Promise.allSettled(traceWrites);
      const completion: EvaluationAgentCompletion = {
        agent: prepared.agent.key,
        output: fallbackOutput,
        usedFallback: true,
        ...(prepared.dataSummary ? { dataSummary: prepared.dataSummary } : {}),
        attempt: 1,
        retryCount: 0,
        error: message,
        fallbackReason,
        rawProviderError: message,
        meta: this.buildUnhandledErrorMeta(error),
      };
      this.emitAgentCompletion(onAgentComplete, completion);
      return completion;
    }
  }

  private persistAgentTrace(
    startupId: string,
    pipelineRunId: string | undefined,
    event: PersistedEvaluationTraceEvent,
  ): Promise<void> {
    if (!pipelineRunId) {
      return Promise.resolve();
    }
    if (!this.pipelineAgentTrace) {
      return Promise.resolve();
    }

    const hasOaiTelemetry =
      event.meta &&
      typeof event.meta === "object" &&
      "openaiTelemetry" in event.meta;
    this.logger.log(
      `[persistAgentTrace] agent=${event.agent} status=${event.status} hasMeta=${!!event.meta} hasOaiTelemetry=${hasOaiTelemetry}`,
    );

    return this.pipelineAgentTrace
      .recordRun({
        startupId,
        pipelineRunId,
        phase: PipelinePhase.EVALUATION,
        agentKey: event.agent,
        status: event.status,
        attempt: event.attempt,
        retryCount: event.retryCount,
        usedFallback: event.usedFallback,
        inputPrompt: event.inputPrompt,
        systemPrompt: event.systemPrompt,
        outputText: event.outputText,
        outputJson: event.outputJson,
        meta: event.meta,
        error: event.error,
        fallbackReason: event.fallbackReason,
        rawProviderError: event.rawProviderError,
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[persistAgentTrace] FAILED for ${event.agent}: ${message}`,
        );
      });
  }

  private buildUnhandledErrorMeta(error: unknown): Record<string, unknown> {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "UnhandledError";
    const stack =
      error instanceof Error && typeof error.stack === "string"
        ? error.stack.slice(0, 8_000)
        : undefined;

    return {
      errorDetail: {
        name,
        message,
        ...(stack ? { stack } : {}),
      },
    };
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private bumpFallbackReasonCount(
    counts: Partial<Record<EvaluationFallbackReason, number>>,
    reason: EvaluationFallbackReason | undefined,
  ): void {
    if (!reason) {
      return;
    }
    counts[reason] = (counts[reason] ?? 0) + 1;
  }

  private async recordTelemetrySafely(
    startupId: string,
    payload: Parameters<PipelineStateService["recordAgentTelemetry"]>[1],
  ): Promise<void> {
    try {
      await this.pipelineState.recordAgentTelemetry(startupId, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to record evaluation telemetry for ${payload.agentKey}: ${message}`,
      );
    }
  }

  private emitAgentStart(
    onAgentStart: ((agent: EvaluationAgentKey) => void) | undefined,
    agent: EvaluationAgentKey,
  ): void {
    if (!onAgentStart) {
      return;
    }

    try {
      onAgentStart(agent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluation agent start callback failed for ${agent}: ${message}`,
      );
    }
  }

  private emitAgentCompletion(
    onAgentComplete: ((payload: EvaluationAgentCompletion) => void) | undefined,
    payload: EvaluationAgentCompletion,
  ): void {
    if (!onAgentComplete) {
      return;
    }

    try {
      onAgentComplete(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluation agent completion callback failed for ${payload.agent}: ${message}`,
      );
    }
  }

  private emitAgentLifecycle(
    onAgentLifecycle:
      | ((payload: EvaluationAgentLifecycleEvent) => void)
      | undefined,
    payload: EvaluationAgentLifecycleEvent,
  ): void {
    if (!onAgentLifecycle) {
      return;
    }

    try {
      onAgentLifecycle(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Evaluation agent lifecycle callback failed for ${payload.agent}: ${message}`,
      );
    }
  }

  private async loadFeedbackNotes(
    startupId: string,
    key: EvaluationAgentKey,
  ): Promise<EvaluationFeedbackNote[]> {
    const [phaseScope, agentScope] = await Promise.all([
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.EVALUATION,
        limit: 10,
      }),
      this.pipelineFeedback.getContext({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: key,
        limit: 10,
      }),
    ]);

    const byId = new Map<string, EvaluationFeedbackNote>();
    for (const item of phaseScope.items) {
      if (item.agentKey !== null) {
        continue;
      }
      byId.set(item.id, {
        scope: "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }
    for (const item of agentScope.items) {
      byId.set(item.id, {
        scope: item.agentKey ? `agent:${key}` : "phase",
        feedback: item.feedback,
        createdAt: item.createdAt,
      });
    }

    return Array.from(byId.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);
  }

  private async consumeAgentFeedback(
    startupId: string,
    key: EvaluationAgentKey,
  ): Promise<void> {
    try {
      await this.pipelineFeedback.markConsumedByScope({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: key,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to mark evaluation feedback consumed for ${key}: ${message}`,
      );
    }
  }

  private async consumePhaseFeedback(startupId: string): Promise<void> {
    try {
      await this.pipelineFeedback.markConsumedByScope({
        startupId,
        phase: PipelinePhase.EVALUATION,
        agentKey: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to mark phase-level evaluation feedback consumed: ${message}`,
      );
    }
  }

  private async resolvePipelineInputForAgent(
    agentKey: EvaluationAgentKey,
    pipelineData: EvaluationPipelineInput,
    agentDocumentMap?: Map<EvaluationAgentKey, string[]>,
  ): Promise<ResolvedEvaluationInput> {
    const relevantDocs = agentDocumentMap?.get(agentKey);
    const relevantSupportingDocuments = relevantDocs && relevantDocs.length > 0
      ? `Relevant classified documents for this evaluation:\n${relevantDocs.join("\n")}`
      : undefined;

    if (!this.evaluationInputResolver) {
      return {
        pipelineData: {
          ...pipelineData,
          relevantSupportingDocuments,
          mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
          mappedInputSources: [],
          edgeDrivenInputFallbackUsed: false,
        },
        mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
        sources: [],
        fallbackUsed: false,
        reason: "resolver_unavailable",
      };
    }

    try {
      const resolved = await this.evaluationInputResolver.resolveForAgent(
        agentKey,
        pipelineData,
      );
      if (relevantSupportingDocuments) {
        resolved.pipelineData.relevantSupportingDocuments = relevantSupportingDocuments;
      }
      return resolved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to resolve edge-driven evaluation inputs for ${agentKey}: ${message}`,
      );
      return {
        pipelineData: {
          ...pipelineData,
          relevantSupportingDocuments,
          mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
          mappedInputSources: [],
          edgeDrivenInputFallbackUsed: true,
        },
        mappedInputs: { researchReportText: pipelineData.research.combinedReportText ?? "" },
        sources: [],
        fallbackUsed: true,
        reason: "resolver_error",
      };
    }
  }

  private async loadNodeConfigs(): Promise<PipelineFlowNodeConfigs | undefined> {
    try {
      const result = await this.flowConfigService?.getPublishedParsedFlowDefinition();
      return result?.flowDefinition?.nodeConfigs ?? undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load flow node configs: ${message}`);
      return undefined;
    }
  }

  private buildInputDataSummary(
    resolvedInput: ResolvedEvaluationInput,
  ): Record<string, unknown> | undefined {
    const linkedResearchAgents = Array.from(
      new Set(resolvedInput.sources.map((source) => source.researchAgentId)),
    );
    if (
      linkedResearchAgents.length === 0 &&
      !resolvedInput.fallbackUsed &&
      Object.keys(resolvedInput.mappedInputs).length === 0
    ) {
      return undefined;
    }

    return {
      edgeDrivenInputFallbackUsed: resolvedInput.fallbackUsed,
      mappedSourceCount: resolvedInput.sources.length,
      linkedResearchAgents,
      ...(resolvedInput.reason ? { mappingFallbackReason: resolvedInput.reason } : {}),
    };
  }
}
