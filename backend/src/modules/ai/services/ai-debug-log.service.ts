import { Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { appendFile, mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { rotateIfNeeded } from "../../../common/logging/rotate-log";
import { PipelinePhase } from "../interfaces/pipeline.interface";

type DebugLogKind =
  | "phase_result"
  | "phase_failure"
  | "agent_result"
  | "agent_failure";

@Injectable()
export class AiDebugLogService {
  private readonly logger = new Logger(AiDebugLogService.name);
  private readonly enabled: boolean;
  private readonly logPath: string;

  constructor(@Optional() private config?: ConfigService) {
    this.enabled =
      this.config?.get<boolean>("AI_AGENT_DEBUG_LOG_ENABLED", true) ?? true;
    this.logPath =
      this.config?.get<string>(
        "AI_AGENT_DEBUG_LOG_PATH",
        "logs/ai-agent-debug.jsonl",
      ) ?? "logs/ai-agent-debug.jsonl";
  }

  async logPhaseResult(params: {
    startupId: string;
    pipelineRunId?: string;
    phase: PipelinePhase;
    result: unknown;
  }): Promise<void> {
    await this.write({
      kind: "phase_result",
      ...params,
    });
  }

  async logPhaseFailure(params: {
    startupId: string;
    pipelineRunId?: string;
    phase: PipelinePhase;
    error?: string;
  }): Promise<void> {
    await this.write({
      kind: "phase_failure",
      ...params,
    });
  }

  async logAgentResult(params: {
    startupId: string;
    pipelineRunId?: string;
    phase: PipelinePhase;
    agentKey: string;
    usedFallback: boolean;
    error?: string;
    model?: string;
    output: unknown;
  }): Promise<void> {
    await this.write({
      kind: "agent_result",
      ...params,
    });
  }

  async logAgentFailure(params: {
    startupId: string;
    pipelineRunId?: string;
    phase: PipelinePhase;
    agentKey: string;
    error: string;
  }): Promise<void> {
    await this.write({
      kind: "agent_failure",
      ...params,
    });
  }

  private async write(payload: Record<string, unknown> & { kind: DebugLogKind }) {
    if (!this.enabled) {
      return;
    }

    try {
      const path = this.resolvePath(this.logPath);
      await mkdir(dirname(path), { recursive: true });
      await rotateIfNeeded(path);
      await appendFile(
        path,
        `${JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            ...payload,
          },
          this.jsonReplacer,
        )}\n`,
        "utf8",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[AiDebugLog] Failed to write debug log: ${message}`);
    }
  }

  private resolvePath(filePath: string): string {
    if (filePath.startsWith("/")) {
      return filePath;
    }
    return resolve(process.cwd(), filePath);
  }

  private jsonReplacer(_key: string, value: unknown): unknown {
    if (typeof value === "bigint") {
      return value.toString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    return value;
  }
}
