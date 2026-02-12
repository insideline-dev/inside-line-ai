import { ConsoleLogger, LogLevel } from "@nestjs/common";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  type WriteStream,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

type LogEntry = {
  timestamp: string;
  level: Exclude<LogLevel, "fatal"> | "fatal";
  pid: number;
  context?: string;
  message: string;
  stack?: string;
  meta?: unknown[];
};

export class AppFileLogger extends ConsoleLogger {
  private readonly fileLoggingEnabled: boolean;
  private readonly filePath: string;
  private stream: WriteStream | null = null;

  constructor(context = "AppLogger") {
    super(context, { timestamp: true });
    this.fileLoggingEnabled = this.readFileLoggingEnabled();
    this.filePath = this.resolveLogFilePath();

    if (!this.fileLoggingEnabled) {
      return;
    }

    mkdirSync(dirname(this.filePath), { recursive: true });
    this.stream = createWriteStream(this.filePath, { flags: "a" });
    this.stream.on("error", (error) => {
      super.error(`Failed writing to log file ${this.filePath}: ${String(error)}`);
    });

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
    if (isAbsolute(configured)) {
      return configured;
    }

    const cwd = process.cwd();
    const backendDir = resolve(cwd, "backend");
    if (existsSync(resolve(backendDir, "package.json"))) {
      return resolve(backendDir, configured);
    }

    return resolve(cwd, configured);
  }

  private readFileLoggingEnabled(): boolean {
    const value = process.env.LOG_TO_FILE?.trim().toLowerCase();
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
      this.stream.write(`${JSON.stringify(entry)}\n`);
    } catch (error) {
      super.error(`Failed to append log entry: ${String(error)}`);
    }
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
