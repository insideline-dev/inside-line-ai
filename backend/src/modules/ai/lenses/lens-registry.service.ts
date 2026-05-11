import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { tool, type Tool } from "ai";
import {
  LensInputSchema,
  type LensInput,
  type LensOutput,
} from "../schemas/lens";
import type { BaseLensAgent, LensRunResult } from "./base-lens.agent";

const RUN_ALL_CONCURRENCY = 3;

/**
 * Versioned-key form used by `run('team@2', ctx)` and surfaced when the
 * caller wants to target a specific historical lens version. Parsed by
 * `parseVersionedKey()`.
 */
const VERSIONED_KEY_SEPARATOR = "@" as const;

/**
 * DI token for the array of registered lens workers. The lenses module
 * provides this as a `useFactory` that injects every concrete lens class so
 * adding a new version (e.g. `TeamLensV2`) is a one-line provider addition.
 */
export const LENSES_REGISTRY_TOKEN = Symbol("LENSES_REGISTRY_TOKEN");

interface ParsedLensKey {
  lensKey: string;
  version: string | null;
}

function parseVersionedKey(input: string): ParsedLensKey {
  const sepIdx = input.indexOf(VERSIONED_KEY_SEPARATOR);
  if (sepIdx === -1) {
    return { lensKey: input, version: null };
  }
  return {
    lensKey: input.slice(0, sepIdx),
    version: input.slice(sepIdx + 1) || null,
  };
}

/**
 * Single source of truth for screening lenses (DS-E2-F1-S2 — versioned +
 * hot-swappable).
 *
 * Two surfaces:
 *  - **Code path** (S1): `run(key, ctx)` / `runAll(ctx)` — the screening
 *    processor and any direct caller use these.
 *  - **Tool path** (S2/DS-E7): `asTools()` returns Vercel AI SDK `tool()`
 *    wrappers keyed `lens_market` / `lens_team` / `lens_traction` — bound to
 *    the **active version** of each lens so LLM Deal Agents don't need to
 *    know the version number.
 *
 * Versioning:
 *  - Each lens carries an instance-level `version: string` (e.g. `"1"`).
 *  - The registry stores lenses keyed `"<key>@<version>"` internally so
 *    multiple versions of the same lens key can coexist.
 *  - `getActiveVersion(key)` returns the version env-flagged via
 *    `LENS_ACTIVE_VERSION_<KEY>` (uppercased), falling back to the highest
 *    registered version. The flip is read at call time so no restart is
 *    required between version changes (only env reload, which NestJS handles
 *    on `bun dev` hot-reload).
 *  - `run('team@2', ctx)` targets a specific version; `run('team', ctx)`
 *    targets the active version; `runAll(ctx)` runs only the active set.
 *
 * Tool-name convention: `lens_<key>` (no `@`) because the Vercel AI SDK tool
 * name regex is `^[a-zA-Z0-9_-]+$`.
 */
@Injectable()
export class LensRegistryService {
  private readonly logger = new Logger(LensRegistryService.name);
  /** Versions registered per logical lens key. Insertion order preserved. */
  private readonly versionsByKey: Map<string, string[]>;
  /** Full `"key@version"` → lens lookup. */
  private readonly lensByVersionedKey: Map<string, BaseLensAgent<LensOutput>>;

  constructor(
    private readonly config: ConfigService,
    @Inject(LENSES_REGISTRY_TOKEN)
    lenses: ReadonlyArray<BaseLensAgent<LensOutput>>,
  ) {
    this.versionsByKey = new Map();
    this.lensByVersionedKey = new Map();
    for (const lens of lenses) {
      this.registerLens(lens);
    }
  }

  /** Stable, sorted list of registered logical lens keys (no `@version`). */
  keys(): string[] {
    return Array.from(this.versionsByKey.keys()).sort();
  }

  /**
   * All `"key@version"` combinations currently registered. Useful for tests
   * and admin tooling. Sorted lexicographically for stable output.
   */
  versionedKeys(): string[] {
    return Array.from(this.lensByVersionedKey.keys()).sort();
  }

  /**
   * Active version for a lens key — env-driven via `LENS_ACTIVE_VERSION_<KEY>`
   * with fallback to the highest registered version.
   *
   * Throws when the key has no registered versions, since that's a registry
   * bug (every code path that calls this must know the key exists).
   */
  getActiveVersion(key: string): string {
    const versions = this.versionsByKey.get(key);
    if (!versions || versions.length === 0) {
      throw new Error(`No registered versions for lens key: ${key}`);
    }
    const envOverride = this.readEnvOverride(key);
    if (envOverride !== null) {
      if (!versions.includes(envOverride)) {
        this.logger.warn(
          `LENS_ACTIVE_VERSION_${key.toUpperCase()}=${envOverride} but no such version is registered (have: ${versions.join(", ")}); falling back to highest registered version.`,
        );
      } else {
        return envOverride;
      }
    }
    // Highest registered version. Numeric-aware compare so `"10"` > `"9"`
    // once we ever ship double-digit versions.
    return [...versions].sort(compareVersions).at(-1) ?? versions[0];
  }

  /**
   * Register an additional lens at runtime. Primarily for tests — production
   * code should add the lens to the providers array of `LensesModule` so it
   * flows through the DI token. Throws on (key, version) collisions to keep
   * historical replay deterministic.
   */
  registerLens(lens: BaseLensAgent<LensOutput>): void {
    const versionedKey = `${lens.key}${VERSIONED_KEY_SEPARATOR}${lens.version}`;
    if (this.lensByVersionedKey.has(versionedKey)) {
      throw new Error(
        `Duplicate lens registration for ${versionedKey}; bump the lens class version (DS-E2-F1-S2)`,
      );
    }
    this.lensByVersionedKey.set(versionedKey, lens);
    const versions = this.versionsByKey.get(lens.key) ?? [];
    versions.push(lens.version);
    this.versionsByKey.set(lens.key, versions);
  }

  /**
   * Run a single lens. Accepts either a logical key (`"team"`) — which
   * routes to the active version — or a versioned key (`"team@2"`) — which
   * targets a specific version.
   */
  async run(key: string, ctx: LensInput): Promise<LensRunResult<LensOutput>> {
    const lens = this.resolveLens(key);
    if (!lens) {
      throw new Error(`Unknown lens key: ${key}`);
    }
    return lens.run(ctx);
  }

  /**
   * Run every registered lens with bounded parallelism, using each key's
   * **active version**. Each lens has its own fallback so this never throws —
   * failures surface via `usedFallback`.
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
   * Vercel AI SDK tool wrappers — one per **logical** lens key, bound to the
   * active version at call time. Underscore separator is required by the
   * Vercel SDK tool name regex (no `@`); the active version is resolved on
   * each `execute()` call so a hot-swap doesn't require rebuilding the tool
   * surface.
   */
  asTools(): Record<string, Tool> {
    const tools: Record<string, Tool> = {};
    for (const key of this.keys()) {
      // Use the active version's description for the tool surface — if v2
      // describes itself differently, the LLM should see the v2 description.
      const description = this.resolveLens(key)?.description ?? "";
      tools[`lens_${key}`] = tool({
        description,
        inputSchema: LensInputSchema,
        execute: async (args) => {
          const parsed = LensInputSchema.parse(args);
          // Re-resolve on every call so the env flip takes effect without
          // having to rebuild the tools map (DS-E2-F1-S2 hot-swap requirement).
          const lens = this.resolveLens(key);
          if (!lens) {
            throw new Error(`Lens disappeared from registry: ${key}`);
          }
          const result = await lens.run(parsed);
          return result.output;
        },
      });
    }
    return tools;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private resolveLens(
    rawKey: string,
  ): BaseLensAgent<LensOutput> | undefined {
    const { lensKey, version } = parseVersionedKey(rawKey);
    if (!this.versionsByKey.has(lensKey)) {
      return undefined;
    }
    const resolvedVersion = version ?? this.getActiveVersion(lensKey);
    return this.lensByVersionedKey.get(
      `${lensKey}${VERSIONED_KEY_SEPARATOR}${resolvedVersion}`,
    );
  }

  private readEnvOverride(key: string): string | null {
    const envKey = `LENS_ACTIVE_VERSION_${key.toUpperCase()}`;
    const raw = this.config.get<string>(envKey);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

/**
 * Numeric-aware version compare. Treats versions as positive integers when
 * possible (so `"10"` > `"9"`); falls back to string compare otherwise.
 * Exported only for tests.
 */
export function compareVersions(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(na) === a && String(nb) === b) {
    return na - nb;
  }
  return a.localeCompare(b);
}
