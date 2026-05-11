import {
  Injectable,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { StartupStage } from "../../startup/entities/startup.schema";
import {
  AI_PROMPT_CATALOG,
  AI_PROMPT_KEYS,
  AI_PROMPT_VARIABLE_DEFINITIONS,
  isAiPromptKey,
  type AiPromptKey,
  type PromptVariableDefinition,
} from "./ai-prompt-catalog";
import { AI_FLOW_DEFINITIONS } from "./ai-flow-catalog";

export interface ResolvedPrompt {
  key: string;
  stage: StartupStage | null;
  systemPrompt: string;
  userPrompt: string;
  source: "code";
  revisionId: string | null;
  /**
   * Catalog version that produced this prompt body (DS-E2-F1-S2). `null` for
   * entries that do not declare a `versions` map; otherwise the resolved
   * version key (e.g. `"1"`). Persisted onto `startup_lens_result.prompt_version`
   * by the screening processor so replay-time can fetch the exact body that
   * produced a historical decision.
   */
  version: string | null;
}

@Injectable()
export class AiPromptService {
  private readonly logger = new Logger(AiPromptService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: ResolvedPrompt }>();
  private readonly cacheTtlMs = 60_000;
  private readonly promptLibraryRoot = (() => {
    const fromBackendCwd = resolve(process.cwd(), "src/modules/ai/prompts/library");
    if (existsSync(fromBackendCwd)) return fromBackendCwd;
    return resolve(process.cwd(), "backend/src/modules/ai/prompts/library");
  })();
  private readonly stageList = Object.values(StartupStage) as StartupStage[];
  private readonly narrativePurityGuardrail = [
    "## Internal Narrative Guardrail",
    "For all narrative prose fields (feedback, narrativeSummary, memoNarrative, investorMemo sections, founderReport sections):",
    "- Do NOT mention numeric scores, confidence levels, percentages, or any X/100 notation.",
    "- Keep prose qualitative and insight-driven.",
    "- Put quantitative values only in dedicated structured numeric fields.",
  ].join("\n");

  constructor(@Optional() private config?: ConfigService) {}

  async resolve(params: {
    key: string;
    stage?: string | null;
    /**
     * Optional version (DS-E2-F1-S2). Routes to the version-keyed body in the
     * catalog's `versions` map. When omitted, falls back to the entry's
     * `activeVersion` (if any), else the legacy `defaultSystemPrompt` /
     * `defaultUserPrompt` pair.
     */
    version?: string | null;
  }): Promise<ResolvedPrompt> {
    const normalizedStage = this.normalizeStage(params.stage);
    const requestedVersion = params.version ?? null;
    const cacheKey = `${params.key}::${normalizedStage ?? "global"}::${requestedVersion ?? "active"}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    if (!isAiPromptKey(params.key)) {
      this.logger.warn(`Unknown prompt key: ${params.key}, returning empty prompt`);
      const empty: ResolvedPrompt = {
        key: params.key,
        stage: normalizedStage,
        systemPrompt: "",
        userPrompt: "",
        source: "code",
        revisionId: null,
        version: requestedVersion,
      };
      this.setCache(cacheKey, empty);
      return empty;
    }

    const prompt = this.resolvePromptFromFiles(params.key, normalizedStage, requestedVersion);
    const resolved: ResolvedPrompt = {
      key: params.key,
      stage: normalizedStage,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      source: "code",
      revisionId: null,
      version: prompt.version,
    };

    const guardedResolved = this.injectNarrativeGuardrails(resolved);
    this.setCache(cacheKey, guardedResolved);
    return guardedResolved;
  }

  async getPromptCoverageAudit(stage?: string | null) {
    const normalizedStage = this.normalizeStage(stage);
    const definitions = await this.listPromptDefinitions();

    return {
      strictModeEnabled: false,
      stage: normalizedStage,
      items: definitions.map((definition) => {
        const hasPublishedGlobal = Boolean(definition.publishedGlobal);
        const hasPublishedStage = normalizedStage
          ? definition.publishedStages.some((item) => item.stage === normalizedStage)
          : false;
        const wouldFallback = normalizedStage
          ? !hasPublishedStage && !hasPublishedGlobal
          : !hasPublishedGlobal;
        const isCritical = this.isCriticalPipelinePrompt(definition.key);

        return {
          key: definition.key,
          isCritical,
          hasPublishedGlobal,
          hasPublishedStage: normalizedStage ? hasPublishedStage : null,
          wouldFallback,
          strictViolation: false,
        };
      }),
    };
  }

  renderTemplate(
    template: string,
    variables: Record<string, string | number | null | undefined>,
  ): string {
    const resolveVariable = (_: string, variableName: string) => {
      const value = variables[variableName];
      if (value === null || value === undefined) {
        return "";
      }
      return String(value);
    };

    const doubleBraceRendered = template.replace(
      /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
      resolveVariable,
    );

    return doubleBraceRendered.replace(
      /(?<!{){\s*([a-zA-Z0-9_]+)\s*}(?!})/g,
      resolveVariable,
    );
  }

  async listPromptDefinitions() {
    return AI_PROMPT_KEYS.map((key) => {
      const definitionId = this.createDeterministicUuid(`prompt-definition:${key}`);
      const catalog = AI_PROMPT_CATALOG[key];

      return {
        id: definitionId,
        key,
        displayName: catalog.displayName,
        description: catalog.description,
        surface: catalog.surface,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        publishedGlobal: this.buildPublishedMeta(key, definitionId, null),
        publishedStages: this.stageList
          .filter((stage) => this.hasStageOverride(key, stage))
          .map((stage) => this.buildPublishedMeta(key, definitionId, stage))
          .filter((item): item is NonNullable<typeof item> => item !== null),
        allowedVariables: catalog.allowedVariables,
        requiredVariables: catalog.requiredVariables,
        variableDefinitions: this.getVariableDefinitions(catalog.allowedVariables),
      };
    });
  }

  async getRevisionsByKey(key: string) {
    if (!isAiPromptKey(key)) {
      return {
        definition: null,
        revisions: [],
        allowedVariables: [],
        requiredVariables: [],
        variableDefinitions: {},
      };
    }

    const definitionId = this.createDeterministicUuid(`prompt-definition:${key}`);
    const catalog = AI_PROMPT_CATALOG[key];
    const definition = {
      id: definitionId,
      key,
      displayName: catalog.displayName,
      description: catalog.description,
      surface: catalog.surface,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      publishedGlobal: this.buildPublishedMeta(key, definitionId, null),
      publishedStages: this.stageList
        .filter((stage) => this.hasStageOverride(key, stage))
        .map((stage) => this.buildPublishedMeta(key, definitionId, stage))
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };

    const revisions = [null, ...this.stageList].map((stage, index) => {
      const resolved = this.resolvePromptFromFiles(key, stage);
      const revisionSeed = [
        key,
        stage ?? "global",
        resolved.systemPrompt,
        resolved.userPrompt,
      ].join("::");
      return {
        id: this.createDeterministicUuid(`prompt-revision:${revisionSeed}`),
        definitionId,
        stage,
        status: "published" as const,
        systemPrompt: resolved.systemPrompt,
        userPrompt: resolved.userPrompt,
        notes:
          stage === null
            ? "Resolved from local prompt library (global)."
            : resolved.effectiveStage === stage
              ? `Resolved from local prompt library (${stage}).`
              : `Resolved from local prompt library (fallback to global for ${stage}).`,
        version: index + 1,
        createdBy: null,
        publishedBy: null,
        publishedAt: new Date(0),
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
    });

    return {
      definition,
      revisions,
      allowedVariables: catalog.allowedVariables,
      requiredVariables: catalog.requiredVariables,
      variableDefinitions: this.getVariableDefinitions(catalog.allowedVariables),
    };
  }

  getFlowGraph() {
    return {
      flows: AI_FLOW_DEFINITIONS,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private keyToLibrarySegments(key: AiPromptKey): string[] {
    return key
      .split(".")
      .map((segment) =>
        segment
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .replace(/_/g, "-")
          .toLowerCase(),
      );
  }

  private buildPromptFilePath(
    key: AiPromptKey,
    type: "system" | "user",
    stage: StartupStage | null,
  ): string {
    const stagePath = stage === null ? "global" : join("stages", stage);
    return join(
      this.promptLibraryRoot,
      stagePath,
      ...this.keyToLibrarySegments(key),
      `${type}.md`,
    );
  }

  private readPromptFile(path: string): string | null {
    if (!existsSync(path)) {
      return null;
    }
    return readFileSync(path, "utf8").replace(/\s+$/, "");
  }

  private resolvePromptFromFiles(
    key: AiPromptKey,
    stage: StartupStage | null,
    requestedVersion: string | null = null,
  ): {
    systemPrompt: string;
    userPrompt: string;
    effectiveStage: StartupStage | null;
    /** Resolved version, or null for entries without a `versions` map. */
    version: string | null;
  } {
    const catalog = AI_PROMPT_CATALOG[key];

    // DS-E2-F1-S2 — versioned bodies. When the entry declares a `versions`
    // map, prefer it over the legacy `defaultSystemPrompt` / `defaultUserPrompt`
    // pair. Falls back to defaults if the requested version is unknown.
    const versionedBody = this.resolveVersionedBody(catalog, requestedVersion);

    const globalSystem =
      this.readPromptFile(this.buildPromptFilePath(key, "system", null)) ??
      versionedBody.systemPrompt;
    const globalUser =
      this.readPromptFile(this.buildPromptFilePath(key, "user", null)) ??
      versionedBody.userPrompt;

    if (!stage) {
      return {
        systemPrompt: globalSystem,
        userPrompt: globalUser,
        effectiveStage: null,
        version: versionedBody.version,
      };
    }

    const stageSystem = this.readPromptFile(this.buildPromptFilePath(key, "system", stage));
    const stageUser = this.readPromptFile(this.buildPromptFilePath(key, "user", stage));
    const hasStageOverride = Boolean(stageSystem || stageUser);

    return {
      systemPrompt: stageSystem ?? globalSystem,
      userPrompt: stageUser ?? globalUser,
      effectiveStage: hasStageOverride ? stage : null,
      version: versionedBody.version,
    };
  }

  /**
   * Pick the right body from a catalog entry given an optional version
   * request. Three cases:
   *  - Entry has no `versions` map → return defaults, `version = null`.
   *  - Caller didn't supply a version → use `activeVersion`. Falls back to
   *    defaults if `activeVersion` isn't in the map (shouldn't happen for a
   *    well-formed catalog, but stays defensive).
   *  - Caller supplied a version → use that exact version. Falls back to
   *    `activeVersion` (then defaults) with a warning if unknown.
   */
  private resolveVersionedBody(
    catalog: { defaultSystemPrompt: string; defaultUserPrompt: string; versions?: Record<string, { systemPrompt: string; userPrompt: string }>; activeVersion?: string },
    requestedVersion: string | null,
  ): { systemPrompt: string; userPrompt: string; version: string | null } {
    const versions = catalog.versions;
    if (!versions) {
      return {
        systemPrompt: catalog.defaultSystemPrompt,
        userPrompt: catalog.defaultUserPrompt,
        version: null,
      };
    }

    if (requestedVersion !== null) {
      const body = versions[requestedVersion];
      if (body) {
        return { ...body, version: requestedVersion };
      }
      this.logger.warn(
        `Requested prompt version ${requestedVersion} not in catalog versions [${Object.keys(versions).join(", ")}]; falling back to active.`,
      );
    }

    const activeVersion = catalog.activeVersion;
    if (activeVersion) {
      const body = versions[activeVersion];
      if (body) {
        return { ...body, version: activeVersion };
      }
    }

    return {
      systemPrompt: catalog.defaultSystemPrompt,
      userPrompt: catalog.defaultUserPrompt,
      version: null,
    };
  }

  private hasStageOverride(key: AiPromptKey, stage: StartupStage): boolean {
    return (
      existsSync(this.buildPromptFilePath(key, "system", stage)) ||
      existsSync(this.buildPromptFilePath(key, "user", stage))
    );
  }

  private buildPublishedMeta(
    key: AiPromptKey,
    definitionId: string,
    stage: StartupStage | null,
  ) {
    if (stage !== null && !this.hasStageOverride(key, stage)) {
      return null;
    }

    const resolved = this.resolvePromptFromFiles(key, stage);
    const seed = [key, stage ?? "global", resolved.systemPrompt, resolved.userPrompt].join(
      "::",
    );

    return {
      id: this.createDeterministicUuid(`prompt-meta:${seed}`),
      definitionId,
      stage,
      version: 1,
      publishedAt: new Date(0),
    };
  }

  private createDeterministicUuid(seed: string): string {
    const hex = createHash("sha256").update(seed).digest("hex");
    const v = "5";
    const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `${v}${hex.slice(13, 16)}`,
      `${variant}${hex.slice(17, 20)}`,
      hex.slice(20, 32),
    ].join("-");
  }

  private normalizeStage(stage?: string | null): StartupStage | null {
    if (!stage) {
      return null;
    }

    const normalized = String(stage).trim().toLowerCase().replace(/-/g, "_");
    if (Object.values(StartupStage).includes(normalized as StartupStage)) {
      return normalized as StartupStage;
    }

    this.logger.warn(`Ignoring unknown startup stage for prompt resolution: ${stage}`);
    return null;
  }

  private isCriticalPipelinePrompt(key: string): boolean {
    return (
      key === "synthesis.final" ||
      key.startsWith("evaluation.") ||
      key.startsWith("research.")
    );
  }

  private invalidateKeyCache(key: AiPromptKey): void {
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith(`${key}::`)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  private injectNarrativeGuardrails(prompt: ResolvedPrompt): ResolvedPrompt {
    if (!this.shouldInjectNarrativeGuardrail(prompt.key)) {
      return prompt;
    }

    if (prompt.systemPrompt.includes("Internal Narrative Guardrail")) {
      return prompt;
    }

    return {
      ...prompt,
      systemPrompt: `${prompt.systemPrompt}\n\n${this.narrativePurityGuardrail}`,
    };
  }

  private shouldInjectNarrativeGuardrail(key: string): boolean {
    if (!isAiPromptKey(key)) {
      return false;
    }

    return AI_PROMPT_CATALOG[key].surface === "pipeline";
  }

  private setCache(cacheKey: string, value: ResolvedPrompt): void {
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private getVariableDefinitions(
    variableNames: string[],
  ): Record<string, PromptVariableDefinition> {
    const definitions: Record<string, PromptVariableDefinition> = {};

    for (const variableName of variableNames) {
      const known = AI_PROMPT_VARIABLE_DEFINITIONS[variableName];
      definitions[variableName] = known ?? {
        description: "Variable supported by this prompt key.",
        source: "Prompt runtime context builder",
      };
    }

    return definitions;
  }
}
