import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { DrizzleService } from "../../../database";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { pipelineFailure } from "../entities";
import { RetryPolicy } from "./pipeline.config";

interface FailurePayload {
  pipelineRunId: string;
  startupId: string;
  phase: PipelinePhase;
  retryCount: number;
  error: Record<string, unknown>;
  jobData?: Record<string, unknown>;
}

@Injectable()
export class ErrorRecoveryService implements OnModuleDestroy {
  private readonly logger = new Logger(ErrorRecoveryService.name);
  private readonly phaseTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly startupTimeoutKeys = new Map<string, Set<string>>();

  constructor(private drizzle: DrizzleService) {}

  getRetryDelayMs(policy: RetryPolicy, attempt: number): number {
    const safeAttempt = Math.max(1, attempt);
    if (policy.backoff === "linear") {
      return policy.initialDelayMs * safeAttempt;
    }
    if (policy.backoff === "fixed") {
      return policy.initialDelayMs;
    }
    return policy.initialDelayMs * 2 ** (safeAttempt - 1);
  }

  schedulePhaseTimeout(params: {
    startupId: string;
    phase: PipelinePhase;
    timeoutMs: number;
    onTimeout: () => void;
  }): void {
    this.clearPhaseTimeout(params.startupId, params.phase);
    const key = this.timeoutKey(params.startupId, params.phase);
    const timer = setTimeout(params.onTimeout, params.timeoutMs);
    this.phaseTimeouts.set(key, timer);
    const startupKeys = this.startupTimeoutKeys.get(params.startupId) ?? new Set<string>();
    startupKeys.add(key);
    this.startupTimeoutKeys.set(params.startupId, startupKeys);
  }

  clearPhaseTimeout(startupId: string, phase: PipelinePhase): void {
    const key = this.timeoutKey(startupId, phase);
    const timer = this.phaseTimeouts.get(key);
    if (timer) {
      clearTimeout(timer);
      this.phaseTimeouts.delete(key);
    }
    const startupKeys = this.startupTimeoutKeys.get(startupId);
    if (startupKeys) {
      startupKeys.delete(key);
      if (startupKeys.size === 0) {
        this.startupTimeoutKeys.delete(startupId);
      }
    }
  }

  clearAllTimeoutsForStartup(startupId: string): void {
    const startupKeys = this.startupTimeoutKeys.get(startupId);
    if (!startupKeys) {
      return;
    }

    for (const key of startupKeys) {
      const timer = this.phaseTimeouts.get(key);
      if (timer) {
        clearTimeout(timer);
      }
      this.phaseTimeouts.delete(key);
    }
    this.startupTimeoutKeys.delete(startupId);
  }

  async recordFailure(payload: FailurePayload): Promise<void> {
    try {
      await this.drizzle.db.insert(pipelineFailure).values({
        pipelineRunId: payload.pipelineRunId,
        startupId: payload.startupId,
        phase: payload.phase,
        jobData: payload.jobData,
        error: payload.error,
        retryCount: payload.retryCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to persist pipeline failure for startup ${payload.startupId} phase ${payload.phase}: ${message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.phaseTimeouts.values()) {
      clearTimeout(timer);
    }
    this.phaseTimeouts.clear();
    this.startupTimeoutKeys.clear();
  }

  private timeoutKey(startupId: string, phase: PipelinePhase): string {
    return `${startupId}:${phase}`;
  }
}
