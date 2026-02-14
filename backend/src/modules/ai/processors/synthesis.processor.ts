import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Job } from "bullmq";
import {
  AiSynthesisJobData,
  AiSynthesisJobResult,
} from "../../../queue/interfaces";
import { QUEUE_CONCURRENCY, QUEUE_NAMES } from "../../../queue";
import {
  BaseProcessor,
  parseRedisUrl,
} from "../../../queue/processors/base.processor";
import { NotificationGateway } from "../../../notification/notification.gateway";
import { PipelinePhase } from "../interfaces/pipeline.interface";
import { PipelineStateService } from "../services/pipeline-state.service";
import { PipelineService } from "../services/pipeline.service";
import { SynthesisService } from "../services/synthesis.service";
import { runPipelinePhase } from "./run-phase.util";

@Injectable()
export class SynthesisProcessor
  extends BaseProcessor<AiSynthesisJobData, AiSynthesisJobResult>
  implements OnModuleInit, OnModuleDestroy
{
  protected readonly logger = new Logger(SynthesisProcessor.name);

  constructor(
    config: ConfigService,
    private synthesisService: SynthesisService,
    private pipelineState: PipelineStateService,
    private pipelineService: PipelineService,
    private notificationGateway: NotificationGateway,
  ) {
    const redisUrl = config.get<string>("REDIS_URL", "redis://localhost:6379");
    const queuePrefix = config.get<string>("QUEUE_PREFIX");
    super(
      QUEUE_NAMES.AI_SYNTHESIS,
      parseRedisUrl(redisUrl),
      QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SYNTHESIS],
      queuePrefix,
    );
  }

  async onModuleInit() {
    await this.initialize();
    if (!this.worker) {
      this.logger.warn(
        "SynthesisProcessor initialized without an active worker; recovery will retry automatically.",
      );
      return;
    }
    this.logger.log(`✅ SynthesisProcessor ready | Queue: ${QUEUE_NAMES.AI_SYNTHESIS} | Concurrency: ${QUEUE_CONCURRENCY[QUEUE_NAMES.AI_SYNTHESIS]}`);
  }

  async onModuleDestroy() {
    await this.close();
  }

  protected async process(
    job: Job<AiSynthesisJobData>,
  ): Promise<Omit<AiSynthesisJobResult, "jobId" | "duration" | "success">> {
    const { startupId } = job.data;

    if (job.data.type !== "ai_synthesis") {
      throw new Error("Invalid job type for synthesis processor");
    }

    const runResult = await runPipelinePhase({
      job,
      phase: PipelinePhase.SYNTHESIS,
      jobType: "ai_synthesis",
      pipelineState: this.pipelineState,
      pipelineService: this.pipelineService,
      notificationGateway: this.notificationGateway,
      run: () => this.synthesisService.run(startupId),
    });

    return {
      type: "ai_synthesis",
      startupId: runResult.startupId,
      pipelineRunId: runResult.pipelineRunId,
      data: runResult.result,
    };
  }
}
