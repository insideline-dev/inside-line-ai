import { createHash } from 'node:crypto';

/**
 * Canonical-name + email-hash helpers used by the public portal apply path.
 *
 * Pure functions, no Nest dependencies — kept here (rather than in the service)
 * so unit tests can hit them directly and so any future cross-module caller
 * (Clara, admin import) can reuse them. The shape mirrors the existing
 * `normalizeCompanyNameForDuplicateMatching` private helper in
 * `clara-submission.service.ts` — same legal-suffix and ampersand handling —
 * but lifted out so we don't bloat that service with a second copy.
 */

const LEGAL_SUFFIX_RE =
  /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|sarl|sa|sas)\b/g;

/**
 * Aggressive normalization for fuzzy-duplicate matching.
 *
 * `"Acme AI"`, `"acme.ai"`, `"Acme A.I."`, `"Acme, Inc."` all collapse to
 * `"acme ai"`. Returns `null` for empty / whitespace-only / placeholder
 * inputs so callers can skip the check rather than match on garbage.
 */
export function normalizeCompanyNameForMatch(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIX_RE, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;
  if (
    normalized === 'unknown' ||
    normalized === 'n a' ||
    normalized === 'untitled startup' ||
    normalized === 'pending extraction'
  ) {
    return null;
  }
  return normalized;
}

/**
 * SHA-256 of the lowercased+trimmed email. Used as the index key so we can
 * count attempts per founder without putting raw PII in `pg_indexes`. Stable
 * across casing / surrounding whitespace.
 */
export function hashFounderEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Best-effort client IP extraction. Prefers `X-Forwarded-For` (first hop)
 * when present — when we're behind Cloudflare / Nginx / a Render-style proxy,
 * `req.ip` is the proxy itself. Falls back to whatever Nest gave us. Returns
 * `null` if we can't determine an IP at all (test envs, unit tests).
 */
export function extractClientIp(input: {
  ip?: string | null;
  forwardedFor?: string | string[] | null;
}): string | null {
  const xff = input.forwardedFor;
  if (xff) {
    const first = Array.isArray(xff) ? xff[0] : xff.split(',')[0];
    const trimmed = first?.trim();
    if (trimmed) return trimmed;
  }
  if (input.ip) {
    const trimmed = input.ip.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
