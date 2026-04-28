import { Injectable, Logger } from "@nestjs/common";
import { tool, type Tool } from "ai";
import {
  LensInputSchema,
  type LensInput,
  type LensOutput,
} from "../schemas/lens";
import type { BaseLensAgent, LensRunResult } from "./base-lens.agent";
import { MarketLens } from "./market.lens";
import { TeamLens } from "./team.lens";
import { TractionLens } from "./traction.lens";

const RUN_ALL_CONCURRENCY = 3;

/**
 * Single source of truth for screening lenses.
 *
 * Two surfaces:
 *  - **Code path** (S1): `run(key, ctx)` / `runAll(ctx)` — the screening
 *    processor and any direct caller use these.
 *  - **Tool path** (S2/DS-E7): `asTools()` returns Vercel AI SDK `tool()`
 *    wrappers keyed `lens_market` / `lens_team` / `lens_traction` so an LLM
 *    Deal Agent can invoke a lens by name.
 */
@Injectable()
export class LensRegistryService {
  private readonly logger = new Logger(LensRegistryService.name);
  private readonly lenses: Map<string, BaseLensAgent<LensOutput>>;

  constructor(
    market: MarketLens,
    team: TeamLens,
    traction: TractionLens,
  ) {
    this.lenses = new Map<string, BaseLensAgent<LensOutput>>([
      [market.key, market],
      [team.key, team],
      [traction.key, traction],
    ]);
  }

  /** Stable, sorted list of registered lens keys. */
  keys(): string[] {
    return Array.from(this.lenses.keys()).sort();
  }

  /** Run a single lens by key. Throws if the key is not registered. */
  async run(key: string, ctx: LensInput): Promise<LensRunResult<LensOutput>> {
    const lens = this.lenses.get(key);
    if (!lens) {
      throw new Error(`Unknown lens key: ${key}`);
    }
    return lens.run(ctx);
  }

  /**
   * Run every registered lens with bounded parallelism. Each lens has its own
   * fallback so this never throws — failures surface via `usedFallback`.
   */
  async runAll(
    ctx: LensInput,
  ): Promise<Record<string, LensRunResult<LensOutput>>> {
    const keys = this.keys();
    const results: Record<string, LensRunResult<LensOutput>> = {};

    let cursor = 0;
    const workers: Array<Promise<void>> = [];
    const next = async (): Promise<void> => {
      while (cursor < keys.length) {
        const idx = cursor++;
        const key = keys[idx];
        try {
          results[key] = await this.run(key, ctx);
        } catch (err) {
          // run() only throws on unknown key (registry bug). Defensive guard.
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Lens '${key}' threw at registry boundary: ${message}`);
        }
      }
    };

    const poolSize = Math.min(RUN_ALL_CONCURRENCY, keys.length);
    for (let i = 0; i < poolSize; i += 1) {
      workers.push(next());
    }
    await Promise.all(workers);

    return results;
  }

  /**
   * Vercel AI SDK tool wrappers — one per lens, keyed `lens_<key>`.
   * Underscore separator is required by the Vercel SDK tool name regex.
   */
  asTools(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};
    for (const [key, lens] of this.lenses.entries()) {
      tools[`lens_${key}`] = tool({
        description: lens.description,
        inputSchema: LensInputSchema,
        execute: async (args) => {
          const parsed = LensInputSchema.parse(args);
          const result = await lens.run(parsed);
          return result.output;
        },
      });
    }
    return tools;
  }
}
