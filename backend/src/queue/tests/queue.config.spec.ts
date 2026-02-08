import { describe, expect, it } from "bun:test";
import {
  QUEUE_CONCURRENCY,
  DEFAULT_QUEUE_DEPTH_LIMITS,
  QUEUE_NAMES,
  resolveQueueDepthLimits,
} from "../queue.config";

describe("queue.config", () => {
  it("includes ai pipeline queues", () => {
    expect(QUEUE_NAMES.AI_EXTRACTION).toBe("ai-extraction");
    expect(QUEUE_NAMES.AI_SCRAPING).toBe("ai-scraping");
    expect(QUEUE_NAMES.AI_RESEARCH).toBe("ai-research");
    expect(QUEUE_NAMES.AI_EVALUATION).toBe("ai-evaluation");
    expect(QUEUE_NAMES.AI_SYNTHESIS).toBe("ai-synthesis");
  });

  it("defines concurrency and depth limits for each queue", () => {
    const names = Object.values(QUEUE_NAMES);
    const limits = resolveQueueDepthLimits((key, fallback) => {
      if (key === "QUEUE_MAX_DEPTH_AI_RESEARCH") {
        return 777;
      }
      return fallback;
    });

    for (const name of names) {
      expect(typeof QUEUE_CONCURRENCY[name]).toBe("number");
      expect(DEFAULT_QUEUE_DEPTH_LIMITS[name]).toBeDefined();
      expect(limits[name].maxDepth).toBeGreaterThan(0);
      expect(limits[name].maxPerUser).toBeGreaterThan(0);
    }

    expect(limits[QUEUE_NAMES.AI_RESEARCH].maxDepth).toBe(777);
  });
});
