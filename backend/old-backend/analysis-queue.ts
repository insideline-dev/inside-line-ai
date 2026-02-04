import { analyzeStartup } from "./langchain-agents";

interface QueuedJob {
  startupId: number;
  options?: { autoApprove?: boolean; fromStage?: number };
  addedAt: Date;
}

interface ActiveJob {
  startupId: number;
  startedAt: Date;
  promise: Promise<void>;
}

class AnalysisQueue {
  private static instance: AnalysisQueue;
  private queue: QueuedJob[] = [];
  private activeJobs: Map<number, ActiveJob> = new Map();
  private readonly maxConcurrent: number = 3;

  private constructor() {}

  static getInstance(): AnalysisQueue {
    if (!AnalysisQueue.instance) {
      AnalysisQueue.instance = new AnalysisQueue();
    }
    return AnalysisQueue.instance;
  }

  /**
   * Add a startup analysis job to the queue
   * Returns immediately - the job will be processed when capacity is available
   */
  enqueue(startupId: number, options?: { autoApprove?: boolean; fromStage?: number }): void {
    // Don't add if already in queue or currently being processed
    if (this.isInQueue(startupId) || this.isProcessing(startupId)) {
      console.log(`[AnalysisQueue] Startup ${startupId} already queued or processing, skipping`);
      return;
    }

    const job: QueuedJob = {
      startupId,
      options,
      addedAt: new Date(),
    };

    this.queue.push(job);
    console.log(`[AnalysisQueue] Enqueued startup ${startupId}. Queue size: ${this.queue.length}, Active: ${this.activeJobs.size}/${this.maxConcurrent}`);
    
    // Try to process next jobs
    this.processNext();
  }

  /**
   * Check if a startup is waiting in the queue
   */
  isInQueue(startupId: number): boolean {
    return this.queue.some(job => job.startupId === startupId);
  }

  /**
   * Check if a startup is currently being analyzed
   */
  isProcessing(startupId: number): boolean {
    return this.activeJobs.has(startupId);
  }

  /**
   * Get queue status for monitoring
   */
  getStatus(): {
    queueLength: number;
    activeCount: number;
    maxConcurrent: number;
    queuedStartupIds: number[];
    activeStartupIds: number[];
  } {
    return {
      queueLength: this.queue.length,
      activeCount: this.activeJobs.size,
      maxConcurrent: this.maxConcurrent,
      queuedStartupIds: this.queue.map(job => job.startupId),
      activeStartupIds: Array.from(this.activeJobs.keys()),
    };
  }

  /**
   * Get position in queue for a specific startup (0 = currently processing, 1+ = waiting)
   */
  getPosition(startupId: number): number {
    if (this.isProcessing(startupId)) {
      return 0;
    }
    const queueIndex = this.queue.findIndex(job => job.startupId === startupId);
    return queueIndex === -1 ? -1 : queueIndex + 1;
  }

  /**
   * Process jobs from the queue while capacity is available
   */
  private processNext(): void {
    while (this.activeJobs.size < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.startJob(job);
    }
  }

  /**
   * Start processing a job
   */
  private startJob(job: QueuedJob): void {
    console.log(`[AnalysisQueue] Starting analysis for startup ${job.startupId}. Active: ${this.activeJobs.size + 1}/${this.maxConcurrent}`);
    
    const promise = analyzeStartup(job.startupId, job.options)
      .then(() => {
        console.log(`[AnalysisQueue] Completed analysis for startup ${job.startupId}`);
      })
      .catch((error) => {
        console.error(`[AnalysisQueue] Error analyzing startup ${job.startupId}:`, error);
      })
      .finally(() => {
        this.activeJobs.delete(job.startupId);
        console.log(`[AnalysisQueue] Removed startup ${job.startupId} from active. Active: ${this.activeJobs.size}/${this.maxConcurrent}, Queue: ${this.queue.length}`);
        // Process next job when one completes
        this.processNext();
      });

    this.activeJobs.set(job.startupId, {
      startupId: job.startupId,
      startedAt: new Date(),
      promise,
    });
  }
}

// Export singleton instance
export const analysisQueue = AnalysisQueue.getInstance();

// Export function for easy use (drop-in replacement for direct analyzeStartup calls)
export function queueAnalysis(startupId: number, options?: { autoApprove?: boolean; fromStage?: number }): void {
  analysisQueue.enqueue(startupId, options);
}
