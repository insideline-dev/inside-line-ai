import { ConsoleLogger, LogLevel } from "@nestjs/common";
import {
  createWriteStream,
  mkdirSync,
  statSync,
  type WriteStream,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { rotateIfNeeded } from "./rotate-log";
import { resolveBackendLogPath } from "./resolve-log-path";

type LogEntry = {
  timestamp: string;
  level: Exclude<LogLevel, "fatal"> | "fatal";
  pid: number;
  context?: string;
  message: string;
  stack?: string;
  meta?: unknown[];
};

type ContextFileState = {
  filePath: string;
  stream: WriteStream;
  bytesWritten: number;
  rotationPending: boolean;
};

export class AppFileLogger extends ConsoleLogger {
  private readonly fileLoggingEnabled: boolean;
  private readonly filePath: string;
  private readonly contextFileLoggingEnabled: boolean;
  private readonly contextFilesDir: string;
  private readonly runFileLoggingEnabled: boolean;
  private readonly runFilesDir: string;
  private readonly maxFileBytes: number;
  private stream: WriteStream | null = null;
  private bytesWritten = 0;
  private rotationPending = false;
  private readonly contextStreams = new Map<string, ContextFileState>();
  private readonly runStreams = new Map<string, ContextFileState>();

  constructor(context = "AppLogger") {
    super(context, { timestamp: true });
    this.fileLoggingEnabled = this.readFileLoggingEnabled();
    this.filePath = this.resolveLogFilePath();
    this.contextFileLoggingEnabled = this.readContextFileLoggingEnabled();
    this.contextFilesDir = this.resolveContextFilesDir();
    this.runFileLoggingEnabled = this.readRunFileLoggingEnabled();
    this.runFilesDir = this.resolveRunFilesDir();
    this.maxFileBytes = this.readMaxFileBytes();

    if (!this.fileLoggingEnabled) {
      return;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    this.stream = createWriteStream(this.filePath, { flags: "a" });
    this.stream.on("error", (error) => {
      super.error(`Failed writing to log file ${this.filePath}: ${String(error)}`);
    });

    // Seed bytesWritten from existing file size
    try {
      this.bytesWritten = statSync(this.filePath).size;
    } catch {
      this.bytesWritten = 0;
    }

    super.log(`File logging enabled: ${this.filePath}`);
    this.writeToFile("log", "File logging initialized", [this.filePath]);
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(message, ...optionalParams);
    this.writeToFile("log", message, optionalParams);
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(message, ...optionalParams);
    this.writeToFile("error", message, optionalParams);
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(message, ...optionalParams);
    this.writeToFile("warn", message, optionalParams);
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(message, ...optionalParams);
    this.writeToFile("debug", message, optionalParams);
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(message, ...optionalParams);
    this.writeToFile("verbose", message, optionalParams);
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(message, ...optionalParams);
    this.writeToFile("fatal", message, optionalParams);
  }

  private resolveLogFilePath(): string {
    const rawPath = process.env.LOG_FILE_PATH?.trim();
    const configured = rawPath && rawPath.length > 0 ? rawPath : "logs/backend.jsonl";
    return resolveBackendLogPath(configured);
  }

  private resolveContextFilesDir(): string {
    const raw = process.env.LOG_CONTEXT_FILES_DIR?.trim();
    const configured = raw && raw.length > 0 ? raw : "logs/contexts";
    return resolveBackendLogPath(configured);
  }

  private resolveRunFilesDir(): string {
    const raw = process.env.LOG_RUN_FILES_DIR?.trim();
    const configured = raw && raw.length > 0 ? raw : "logs/runs";
    return resolveBackendLogPath(configured);
  }

  private readMaxFileBytes(): number {
    const raw = process.env.LOG_MAX_FILE_SIZE?.trim();
    if (!raw) {
      return 50 * 1024 * 1024; // 50 MB default
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 50 * 1024 * 1024;
  }

  private readFileLoggingEnabled(): boolean {
    const value = process.env.LOG_TO_FILE?.trim().toLowerCase();
    if (!value) {
      return true;
    }
    return !["false", "0", "no", "off"].includes(value);
  }

  private readContextFileLoggingEnabled(): boolean {
    const value = process.env.LOG_CONTEXT_FILES_ENABLED?.trim().toLowerCase();
    if (!value) {
      return true;
    }
    return !["false", "0", "no", "off"].includes(value);
  }

  private readRunFileLoggingEnabled(): boolean {
    const value = process.env.LOG_RUN_FILES_ENABLED?.trim().toLowerCase();
    if (!value) {
      return true;
    }
    return !["false", "0", "no", "off"].includes(value);
  }

  private writeToFile(
    level: LogEntry["level"],
    message: unknown,
    optionalParams: unknown[],
  ): void {
    if (!this.fileLoggingEnabled || !this.stream) {
      return;
    }

    const parsed = this.extractContextAndMeta(level, optionalParams);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      pid: process.pid,
      context: parsed.context,
      message: this.normalizeMessage(message),
      ...(parsed.stack ? { stack: parsed.stack } : {}),
      ...(parsed.meta.length > 0 ? { meta: parsed.meta } : {}),
    };

    try {
      const line = `${JSON.stringify(entry)}\n`;
      this.stream.write(line);
      this.bytesWritten += Buffer.byteLength(line, "utf8");
      this.scheduleRotationCheck();
      this.writeToContextFile(entry, line);
      this.writeToRunFiles(entry, line);
    } catch (error) {
      super.error(`Failed to append log entry: ${String(error)}`);
    }
  }

  private scheduleRotationCheck(): void {
    if (this.rotationPending || this.bytesWritten < this.maxFileBytes) {
      return;
    }
    this.rotationPending = true;

    // Run rotation async — don't block the log call
    rotateIfNeeded(this.filePath, this.maxFileBytes)
      .then((rotated) => {
        if (rotated) {
          this.reopenStream();
          this.bytesWritten = 0;
        }
      })
      .catch(() => {})
      .finally(() => {
        this.rotationPending = false;
      });
  }

  private writeToContextFile(entry: LogEntry, line: string): void {
    if (!this.contextFileLoggingEnabled || !this.fileLoggingEnabled) {
      return;
    }

    const contextKey = this.sanitizeContextForFilename(entry.context ?? "global");
    const state = this.getOrCreateContextStream(contextKey);
    if (!state) {
      return;
    }

    try {
      state.stream.write(line);
      state.bytesWritten += Buffer.byteLength(line, "utf8");
      this.scheduleContextRotationCheck(contextKey, state);
    } catch (error) {
      super.error(
        `Failed to append context log entry (${contextKey}): ${String(error)}`,
      );
    }
  }

  private getOrCreateContextStream(contextKey: string): ContextFileState | null {
    const filePath = resolve(this.contextFilesDir, `${contextKey}.jsonl`);
    return this.getOrCreateScopedStream(
      this.contextStreams,
      contextKey,
      filePath,
      "context log stream",
    );
  }

  private scheduleContextRotationCheck(
    contextKey: string,
    state: ContextFileState,
  ): void {
    if (state.rotationPending || state.bytesWritten < this.maxFileBytes) {
      return;
    }
    state.rotationPending = true;

    rotateIfNeeded(state.filePath, this.maxFileBytes)
      .then((rotated) => {
        if (rotated) {
          state.stream.end();
          state.stream = this.createStream(state.filePath, "context log file");
          state.bytesWritten = 0;
          this.contextStreams.set(contextKey, state);
        }
      })
      .catch(() => {})
      .finally(() => {
        state.rotationPending = false;
      });
  }

  private sanitizeContextForFilename(context: string): string {
    const normalized = context
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized.length > 0 ? normalized : "global";
  }

  private writeToRunFiles(entry: LogEntry, line: string): void {
    if (!this.runFileLoggingEnabled || !this.fileLoggingEnabled) {
      return;
    }

    const identifiers = this.extractPipelineIdentifiers(entry);

    if (identifiers.startupIds.size === 0 && identifiers.pipelineRunIds.size === 0) {
      return;
    }

    for (const startupId of identifiers.startupIds) {
      const safeId = this.sanitizeIdentifierForFilename(startupId);
      if (!safeId) {
        continue;
      }
      const filePath = resolve(this.runFilesDir, "startups", `${safeId}.jsonl`);
      this.appendToScopedStream(
        this.runStreams,
        `startup:${safeId}`,
        filePath,
        line,
        "startup run log stream",
      );
    }

    for (const pipelineRunId of identifiers.pipelineRunIds) {
      const safeId = this.sanitizeIdentifierForFilename(pipelineRunId);
      if (!safeId) {
        continue;
      }
      const filePath = resolve(this.runFilesDir, "pipelines", `${safeId}.jsonl`);
      this.appendToScopedStream(
        this.runStreams,
        `pipeline:${safeId}`,
        filePath,
        line,
        "pipeline run log stream",
      );
    }
  }

  private appendToScopedStream(
    streamMap: Map<string, ContextFileState>,
    key: string,
    filePath: string,
    line: string,
    streamLabel: string,
  ): void {
    const state = this.getOrCreateScopedStream(streamMap, key, filePath, streamLabel);
    if (!state) {
      return;
    }

    try {
      state.stream.write(line);
      state.bytesWritten += Buffer.byteLength(line, "utf8");
      this.scheduleScopedRotationCheck(streamMap, key, state, streamLabel);
    } catch (error) {
      super.error(`Failed to append scoped log entry (${key}): ${String(error)}`);
    }
  }

  private getOrCreateScopedStream(
    streamMap: Map<string, ContextFileState>,
    key: string,
    filePath: string,
    streamLabel: string,
  ): ContextFileState | null {
    const existing = streamMap.get(key);
    if (existing) {
      return existing;
    }

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      const stream = this.createStream(filePath, streamLabel);
      const bytesWritten = this.getFileSize(filePath);
      const state: ContextFileState = {
        filePath,
        stream,
        bytesWritten,
        rotationPending: false,
      };
      streamMap.set(key, state);
      return state;
    } catch (error) {
      super.error(`Failed to initialize ${streamLabel} (${key}): ${String(error)}`);
      return null;
    }
  }

  private scheduleScopedRotationCheck(
    streamMap: Map<string, ContextFileState>,
    key: string,
    state: ContextFileState,
    streamLabel: string,
  ): void {
    if (state.rotationPending || state.bytesWritten < this.maxFileBytes) {
      return;
    }
    state.rotationPending = true;

    rotateIfNeeded(state.filePath, this.maxFileBytes)
      .then((rotated) => {
        if (rotated) {
          state.stream.end();
          state.stream = this.createStream(state.filePath, streamLabel);
          state.bytesWritten = 0;
          streamMap.set(key, state);
        }
      })
      .catch(() => {})
      .finally(() => {
        state.rotationPending = false;
      });
  }

  private createStream(filePath: string, streamLabel: string): WriteStream {
    const stream = createWriteStream(filePath, { flags: "a" });
    stream.on("error", (error) => {
      super.error(`Failed writing ${streamLabel} ${filePath}: ${String(error)}`);
    });
    return stream;
  }

  private getFileSize(filePath: string): number {
    try {
      return statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  private extractPipelineIdentifiers(entry: LogEntry): {
    startupIds: Set<string>;
    pipelineRunIds: Set<string>;
  } {
    const startupIds = new Set<string>();
    const pipelineRunIds = new Set<string>();

    this.collectIdentifiersFromValue(entry.message, startupIds, pipelineRunIds);

    for (const item of entry.meta ?? []) {
      this.collectIdentifiersFromValue(item, startupIds, pipelineRunIds);
    }

    return { startupIds, pipelineRunIds };
  }

  private collectIdentifiersFromValue(
    value: unknown,
    startupIds: Set<string>,
    pipelineRunIds: Set<string>,
    depth = 0,
  ): void {
    if (depth > 6 || value == null) {
      return;
    }

    if (typeof value === "string") {
      this.collectIdentifiersFromText(value, startupIds, pipelineRunIds);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectIdentifiersFromValue(item, startupIds, pipelineRunIds, depth + 1);
      }
      return;
    }

    if (typeof value === "object") {
      for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.toLowerCase();
        if (typeof rawVal === "string") {
          if (key === "startupid" || key === "startup_id") {
            const normalized = this.normalizeUuid(rawVal);
            if (normalized) {
              startupIds.add(normalized);
            }
          } else if (
            key === "pipelinerunid" ||
            key === "pipeline_run_id" ||
            key === "runid" ||
            key === "run_id"
          ) {
            const normalized = this.normalizeRunId(rawVal);
            if (normalized) {
              pipelineRunIds.add(normalized);
            }
          }
        }
        this.collectIdentifiersFromValue(rawVal, startupIds, pipelineRunIds, depth + 1);
      }
    }
  }

  private collectIdentifiersFromText(
    text: string,
    startupIds: Set<string>,
    pipelineRunIds: Set<string>,
  ): void {
    const startupPatterns = [
      /startup(?:\s+id)?\s*[:=]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
      /startup\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    ];

    for (const pattern of startupPatterns) {
      let match: RegExpExecArray | null;
      do {
        match = pattern.exec(text);
        if (match?.[1]) {
          const normalized = this.normalizeUuid(match[1]);
          if (normalized) {
            startupIds.add(normalized);
          }
        }
      } while (match);
    }

    const runPatterns = [
      /pipelinerunid\s*[:=]\s*([a-z0-9._-]{6,80})/gi,
      /runid\s*[:=]\s*([a-z0-9._-]{6,80})/gi,
      /run\s*[:=]\s*([a-z0-9._-]{6,80})/gi,
      /pipeline\s+([a-z0-9._-]{6,80})\s+for\s+startup/gi,
    ];

    for (const pattern of runPatterns) {
      let match: RegExpExecArray | null;
      do {
        match = pattern.exec(text);
        if (match?.[1]) {
          const normalized = this.normalizeRunId(match[1]);
          if (normalized) {
            pipelineRunIds.add(normalized);
          }
        }
      } while (match);
    }
  }

  private normalizeUuid(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    return match ? match[0] : null;
  }

  private normalizeRunId(value: string): string | null {
    const trimmed = value.trim();
    if (!/^[a-z0-9._-]{6,80}$/i.test(trimmed)) {
      return null;
    }
    return trimmed.toLowerCase();
  }

  private sanitizeIdentifierForFilename(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private reopenStream(): void {
    this.stream?.end();
    this.stream = createWriteStream(this.filePath, { flags: "a" });
    this.stream.on("error", (error) => {
      super.error(`Failed writing to log file ${this.filePath}: ${String(error)}`);
    });
  }

  private normalizeMessage(message: unknown): string {
    if (typeof message === "string") {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }

  private extractContextAndMeta(
    level: LogEntry["level"],
    optionalParams: unknown[],
  ): {
    context?: string;
    stack?: string;
    meta: unknown[];
  } {
    const params = [...optionalParams];
    let context = this.context;
    let stack: string | undefined;

    if (level === "error" || level === "fatal") {
      if (typeof params[0] === "string" && this.looksLikeStack(params[0])) {
        stack = params.shift() as string;
      }
      if (typeof params[0] === "string") {
        context = params.shift() as string;
      }
      return { context, stack, meta: params };
    }

    if (params.length > 0 && typeof params[params.length - 1] === "string") {
      context = params.pop() as string;
    }

    return { context, meta: params };
  }

  private looksLikeStack(value: string): boolean {
    return value.includes("\n    at ") || value.startsWith("Error:");
  }
}
