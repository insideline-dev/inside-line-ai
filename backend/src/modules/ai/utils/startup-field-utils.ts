import { StartupStage } from "../../startup/entities/startup.schema";

export interface StartupFieldRecord {
  website: string;
  stage: string;
  industry: string;
  location: string;
  fundingTarget: number;
  teamSize: number;
}

export const PLACEHOLDER_WEBSITE_HOSTS = new Set(["pending-extraction.com"]);

const SIGNATURE_DOMAINS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "github.com",
  "medium.com",
  "calendly.com",
  "linktr.ee",
  "bit.ly",
  "tiktok.com",
]);

const STAGE_MAPPING: Record<string, StartupStage> = {
  pre_seed: StartupStage.PRE_SEED,
  preseed: StartupStage.PRE_SEED,
  seed: StartupStage.SEED,
  series_a: StartupStage.SERIES_A,
  series_b: StartupStage.SERIES_B,
  series_c: StartupStage.SERIES_C,
  series_d: StartupStage.SERIES_D,
  series_e: StartupStage.SERIES_E,
  series_f: StartupStage.SERIES_F_PLUS,
  series_f_plus: StartupStage.SERIES_F_PLUS,
  "series_f+": StartupStage.SERIES_F_PLUS,
};

export function isMissingWebsiteValue(
  value: string | null | undefined,
): boolean {
  if (!value) return true;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return PLACEHOLDER_WEBSITE_HOSTS.has(host);
  } catch {
    return true;
  }
}

export function isLikelyPlaceholderText(
  value: string | null | undefined,
): boolean {
  if (typeof value !== "string") return true;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return (
    normalized.includes("pending extraction") ||
    normalized.includes("pending-extraction") ||
    normalized === "unknown" ||
    normalized === "n/a"
  );
}

export function mapStageToEnum(
  value: string | null | undefined,
): StartupStage | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STAGE_MAPPING[normalized] ?? null;
}

export function isLikelyPlaceholderStage(record: StartupFieldRecord): boolean {
  const normalizedStage = mapStageToEnum(record.stage);
  return !normalizedStage;
}

export function normalizeWebsiteCandidate(
  value: string | null | undefined,
): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function stripEmailSignature(text: string): string {
  const signaturePatterns = [
    /\n-- \n/,
    /\n_{3,}\n/,
    /\n(?:Thanks|Thank you|Regards|Best regards|Best|Cheers|Sincerely|Kind regards|Warm regards),?\s*\n/i,
    /\nSent from (?:my )?/i,
  ];

  let cutIndex = text.length;
  for (const pattern of signaturePatterns) {
    const match = text.match(pattern);
    if (match?.index !== undefined && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }
  return text.slice(0, cutIndex);
}

function isSignatureDomainUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return SIGNATURE_DOMAINS.has(host) ||
      [...SIGNATURE_DOMAINS].some((domain) => host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function extractWebsiteFromText(
  text: string | null | undefined,
): string | null {
  if (!text || typeof text !== "string") return null;

  const bodyText = stripEmailSignature(text);

  const explicitMatches =
    bodyText.match(/\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/gi) ?? [];
  const labeledBareDomain =
    bodyText.match(
      /\bwebsite\b[^a-z0-9]+([a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>()]*)?)/i,
    )?.[1] ?? null;

  const candidates = labeledBareDomain
    ? [...explicitMatches, labeledBareDomain]
    : explicitMatches;

  for (const rawCandidate of candidates) {
    const cleaned = rawCandidate.replace(/[),.;:]+$/g, "").trim();
    if (!cleaned) continue;

    const withProtocol = /^https?:\/\//i.test(cleaned)
      ? cleaned
      : `https://${cleaned}`;

    if (isSignatureDomainUrl(withProtocol)) continue;

    const normalized = normalizeWebsiteCandidate(withProtocol);
    if (!normalized || isMissingWebsiteValue(normalized)) continue;

    return normalized;
  }

  return null;
}

export function extractStageFromText(
  text: string | null | undefined,
): StartupStage | null {
  if (!text || typeof text !== "string") return null;

  const normalized = text.toLowerCase();
  if (/\bpre[\s-]?seed\b/.test(normalized)) return StartupStage.PRE_SEED;
  if (/\bseries[\s-]?a\b/.test(normalized)) return StartupStage.SERIES_A;
  if (/\bseries[\s-]?b\b/.test(normalized)) return StartupStage.SERIES_B;
  if (/\bseries[\s-]?c\b/.test(normalized)) return StartupStage.SERIES_C;
  if (/\bseries[\s-]?d\b/.test(normalized)) return StartupStage.SERIES_D;
  if (/\bseries[\s-]?e\b/.test(normalized)) return StartupStage.SERIES_E;
  if (/\bseries[\s-]?f(?:\+|[\s-]?plus)?\b/.test(normalized)) {
    return StartupStage.SERIES_F_PLUS;
  }
  if (/\bseed\b/.test(normalized)) return StartupStage.SEED;
  return null;
}

export function getMissingCriticalFields(
  record: StartupFieldRecord,
): Array<"website" | "stage"> {
  const missing: Array<"website" | "stage"> = [];
  if (isMissingWebsiteValue(record.website)) missing.push("website");
  if (isLikelyPlaceholderStage(record)) missing.push("stage");
  return missing;
}
