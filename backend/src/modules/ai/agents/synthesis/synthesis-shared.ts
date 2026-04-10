import { z } from "zod";

import type { EvaluationFallbackReason } from "../../interfaces/agent.interface";
import { sanitizeNarrativeText } from "../../services/narrative-sanitizer";

// ─── String utilities ────────────────────────────────────────────────

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function cleanStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .flatMap((item: unknown) => {
      if (typeof item === "string") return [item];
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const gap =
        typeof record.gap === "string"
          ? record.gap
          : typeof record.description === "string"
            ? record.description
            : "";
      const impact = typeof record.impact === "string" ? record.impact : "";
      const action =
        typeof record.suggestedAction === "string"
          ? record.suggestedAction
          : typeof record.action === "string"
            ? record.action
            : "";
      const composed = [
        gap.trim(),
        impact.trim() ? `(${impact.trim()} impact)` : "",
        action.trim() ? `Action: ${action.trim()}` : "",
      ]
        .filter((part) => part.length > 0)
        .join(" ");
      return composed.length > 0 ? [composed] : [];
    })
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item.length > 0);
}

export function sanitizeStringArrayValues(values: string[]): string[] {
  return values
    .map((value) => sanitizeNarrativeText(value))
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 0);
}

// ─── Formatting helpers ──────────────────────────────────────────────

export function asSentence(input: string): string {
  const normalized = normalizeWhitespace(input);
  if (normalized.length === 0) return "";
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

export function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function formatDimensionLabel(key: string): string {
  if (key === "gtm") return "Go-to-Market";
  if (key === "businessModel") return "Business Model";
  if (key === "competitiveAdvantage") return "Competitive Advantage";
  if (key === "dealTerms") return "Deal Terms";
  if (key === "exitPotential") return "Exit Potential";
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (char) => char.toUpperCase());
}

// ─── Timeout & budget ────────────────────────────────────────────────

export function withTimeout<T>(
  operation: (abortSignal: AbortSignal | undefined) => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation(undefined);
  }

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new Error(message));
    }, timeoutMs);

    operation(controller.signal)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        if (settled) {
          reject(new Error(message));
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function getRemainingBudgetMs(
  startedAt: number,
  hardTimeoutMs: number,
): number {
  if (!Number.isFinite(hardTimeoutMs) || hardTimeoutMs <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return hardTimeoutMs - (Date.now() - startedAt);
}

// ─── Provider option helpers ─────────────────────────────────────────

export function stripReasoningEffort(
  opts: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!opts) return opts;
  const result: Record<string, unknown> = {};
  for (const [provider, config] of Object.entries(opts)) {
    if (
      config &&
      typeof config === "object" &&
      "reasoningEffort" in config
    ) {
      const { reasoningEffort: _, ...rest } = config as Record<
        string,
        unknown
      >;
      result[provider] = Object.keys(rest).length > 0 ? rest : undefined;
    } else {
      result[provider] = config;
    }
  }
  return Object.values(result).some((v) => v != null) ? result : undefined;
}

export function overrideReasoningEffort(
  opts: Record<string, unknown> | undefined,
  effort: "low" | "medium" | "high",
): Record<string, unknown> {
  if (!opts) return { openai: { reasoningEffort: effort } };
  const result: Record<string, unknown> = {};
  for (const [provider, config] of Object.entries(opts)) {
    if (provider === "openai" && config && typeof config === "object") {
      result[provider] = {
        ...(config as Record<string, unknown>),
        reasoningEffort: effort,
      };
    } else {
      result[provider] = config;
    }
  }
  if (!("openai" in result)) {
    result.openai = { reasoningEffort: effort };
  }
  return result;
}

// ─── Error classification ────────────────────────────────────────────

export function isNoOutputError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("no output generated") ||
    normalized.includes("no object generated") ||
    normalized.includes("empty response")
  );
}

export function classifyFallbackReason(
  error: unknown,
  message: string,
): EvaluationFallbackReason {
  if (error instanceof z.ZodError) return "SCHEMA_OUTPUT_INVALID";
  if (isNoOutputError(message)) return "EMPTY_STRUCTURED_OUTPUT";
  const normalized = message.toLowerCase();
  if (
    normalized.includes("schema validation failed") ||
    normalized.includes("parseable json") ||
    normalized.includes("invalid json") ||
    normalized.includes("did not contain parseable json")
  )
    return "SCHEMA_OUTPUT_INVALID";
  if (normalized.includes("timed out") || normalized.includes("timeout"))
    return "TIMEOUT";
  if (error instanceof Error) return "MODEL_OR_PROVIDER_ERROR";
  return "UNHANDLED_AGENT_EXCEPTION";
}

export function normalizeFallbackError(
  reason: EvaluationFallbackReason,
  message: string,
): string {
  if (reason === "EMPTY_STRUCTURED_OUTPUT")
    return "Model returned empty structured output; fallback result generated.";
  if (reason === "TIMEOUT")
    return "Model request timed out; fallback result generated.";
  if (reason === "SCHEMA_OUTPUT_INVALID")
    return "Model returned schema-invalid structured output; fallback result generated.";
  if (reason === "MODEL_OR_PROVIDER_ERROR" && message.trim().length > 0)
    return message.trim();
  if (reason === "UNHANDLED_AGENT_EXCEPTION")
    return "Unhandled synthesis exception; fallback result generated.";
  return message;
}

export function shouldRetryFallbackReason(
  reason: EvaluationFallbackReason,
): boolean {
  return (
    reason === "EMPTY_STRUCTURED_OUTPUT" ||
    reason === "SCHEMA_OUTPUT_INVALID" ||
    reason === "TIMEOUT"
  );
}

export function sanitizeRawProviderError(message: string): string {
  const compact = normalizeWhitespace(message);
  return compact.length <= 2000 ? compact : `${compact.slice(0, 2000)}...`;
}

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ─── Response parsing ────────────────────────────────────────────────

export function resolveRawOutputText(
  response: { text?: string } | unknown,
  output?: unknown,
): string {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    typeof (response as { text?: unknown }).text === "string" &&
    (response as { text: string }).text.trim().length > 0
  ) {
    return (response as { text: string }).text;
  }
  if (output === undefined) return "";
  return safeStringify(output);
}

export function extractStructuredOutput(response: unknown): unknown {
  if (!response || typeof response !== "object" || Array.isArray(response))
    return undefined;
  const record = response as Record<string, unknown>;
  return record.experimental_output ?? record.output;
}

export function shouldUseTextOnlyStructuredMode(
  provider: string | undefined,
): boolean {
  return provider === "openai";
}

// ─── JSON extraction & repair ────────────────────────────────────────

export function tryParseJsonObject(text: string): unknown {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractBalancedJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

export function extractJsonCandidate(text: string): unknown {
  const direct = tryParseJsonObject(text.trim());
  if (direct) return direct;

  const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
  for (const match of fencedMatches) {
    if (!match[1]) continue;
    const parsed = tryParseJsonObject(match[1]);
    if (parsed) return parsed;
  }

  const candidates = extractBalancedJsonObjects(text);
  for (const candidate of candidates) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed) return parsed;
  }

  return null;
}

export function repairTruncatedJson(text: string): unknown {
  let json = text.trim();
  json = json.replace(/,\s*$/, "");

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}") {
      if (stack.length > 0 && stack[stack.length - 1] === "{") stack.pop();
    } else if (ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === "[") stack.pop();
    }
  }

  if (inString) json += '"';
  json = json.replace(/,\s*"[^"]*"\s*:\s*$/, "");
  json = json.replace(/,\s*"[^"]*"\s*$/, "");
  json = json.replace(/,\s*$/, "");

  while (stack.length > 0) {
    const open = stack.pop();
    json += open === "{" ? "}" : "]";
  }

  return tryParseJsonObject(json);
}
