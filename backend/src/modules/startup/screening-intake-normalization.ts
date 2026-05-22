import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DrizzleService } from '../../database';
import {
  startup,
  StartupSourcePath,
  StartupStage,
  StartupStatus,
} from './entities/startup.schema';
import { UserRole } from '../../auth/entities/auth.schema';
import { normalizeWebsiteCandidate } from '../ai/utils/startup-field-utils';
import { deriveStartupGeography } from '../geography';

export interface ScreeningIntakeCandidate {
  name: string;
  website?: string | null;
  tagline?: string | null;
  description?: string | null;
  location?: string | null;
  industry?: string | null;
}

export interface NormalizedScreeningIntakeCandidate {
  name: string;
  canonicalName: string | null;
  website: string;
  websiteHost: string | null;
  tagline: string;
  description: string;
  location: string;
  industry: string;
}

export interface StartupDuplicateMatch {
  id: string;
  name: string;
  status: string;
  userId: string;
  matchedOn: 'name' | 'website';
}

export interface StartupDuplicateLookup {
  companyName: string;
  website?: string | null;
  ownerUserId?: string | null;
}

function normalizeTextValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeWebsiteHost(value: string | null | undefined): string | null {
  const normalized = normalizeWebsiteCandidate(value);
  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isLikelyReportStyleCompanyName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (/^\d{4}\s+annual\s+report$/.test(normalized)) {
    return true;
  }
  if (/\bannual\s+report\b/.test(normalized)) {
    return true;
  }
  if (
    /\b(quarterly|q[1-4]|earnings?|supplemental|financial|shareholder)\b/.test(
      normalized,
    ) &&
    /\b(report|results?|data|statement|update)\b/.test(normalized)
  ) {
    return true;
  }
  if (/\bform\s*10[-\s]?[kq]\b/.test(normalized)) {
    return true;
  }

  return false;
}

function isLikelyFilenameStyleName(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (!lower) {
    return true;
  }

  if (
    /\b(pitch\s*deck|deck|presentation|slides?|final|draft|version|copy)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\.(pdf|pptx?|docx?)$/i.test(lower)) {
    return true;
  }
  if ((lower.includes('_') || lower.includes('-')) && /\d/.test(lower)) {
    return true;
  }
  if (/^[a-z]{3,}\d{1,4}$/i.test(lower)) {
    return true;
  }
  if (/^[a-z0-9&.'\s-]+\s(19|20)\d{2}$/i.test(lower)) {
    return true;
  }
  if (/\b(v|ver|version)\s*\d+\b/i.test(lower)) {
    return true;
  }
  return isLikelyReportStyleCompanyName(lower);
}

export function normalizeScreeningCompanyNameCandidate(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/\.(pdf|pptx?|docx?)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return null;
  }

  const strippedContext = normalized
    .replace(
      /\s+(?:is|are|was|were)\s+(?:seeking|raising|looking|building|developing)\b.*$/i,
      '',
    )
    .replace(/\s+(?:seeking|raising)\s+(?:funding|investment|capital)\b.*$/i, '')
    .trim();
  if (!strippedContext) {
    return null;
  }

  const lower = strippedContext.toLowerCase();
  if (
    lower === 'unknown' ||
    lower === 'n/a' ||
    lower === 'untitled startup' ||
    lower.includes('pending extraction')
  ) {
    return null;
  }
  if (isLikelyReportStyleCompanyName(strippedContext)) {
    return null;
  }

  return strippedContext;
}

export function toTrustedScreeningCompanyNameCandidate(
  value: string | null | undefined,
): string | null {
  const candidate = normalizeScreeningCompanyNameCandidate(value);
  if (!candidate || isLikelyFilenameStyleName(candidate)) {
    return null;
  }

  return candidate;
}

export function normalizeScreeningCompanyNameForDuplicateMatching(
  value: string | null | undefined,
): string | null {
  const candidate = toTrustedScreeningCompanyNameCandidate(value);
  if (!candidate) {
    return null;
  }

  const normalized = candidate
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(
      /\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|sarl|sa|sas)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || null;
}

export function isReliableCompanyNameForDuplicateMatching(
  value: string | null | undefined,
): boolean {
  const normalized = toTrustedScreeningCompanyNameCandidate(value);
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (
    lower === 'untitled startup' ||
    lower === 'startup example' ||
    lower.startsWith('startup ')
  ) {
    return false;
  }

  return !isLikelyFilenameStyleName(normalized);
}

export function normalizeScreeningIntakeCandidate(
  input: ScreeningIntakeCandidate,
): NormalizedScreeningIntakeCandidate {
  const normalizedWebsite = normalizeWebsiteCandidate(input.website) ?? '';
  return {
    name: normalizeTextValue(input.name) ?? input.name.trim(),
    canonicalName: normalizeScreeningCompanyNameForDuplicateMatching(input.name),
    website: normalizedWebsite,
    websiteHost: normalizeWebsiteHost(normalizedWebsite),
    tagline: normalizeTextValue(input.tagline) ?? '',
    description: normalizeTextValue(input.description) ?? '',
    location: normalizeTextValue(input.location) ?? 'Unknown',
    industry: normalizeTextValue(input.industry) ?? 'Unknown',
  };
}

// ============================================================================
// DS-E1-F4-S1 — Canonical ScreeningInputV1
//
// One authoritative shape every intake path (investor-manual, founder portal,
// scout, Clara/email, admin-CSV) must produce before writing to the startups
// table. Downstream consumers (scoring, DD, handoff) read this contract; new
// fields go into a future V2 with a discriminated union to keep V1 valid.
//
// Today the canonical object IS the load-bearing input to the DB insert —
// `assertScreeningInputV1` runs on every intake path so a divergence between
// services blows up at insert time rather than silently corrupting later.
// ============================================================================

export const SCREENING_INPUT_VERSION = 1 as const;

export const ScreeningInputV1Schema = z.object({
  schemaVersion: z.literal(SCREENING_INPUT_VERSION),
  sourcePath: z.nativeEnum(StartupSourcePath),
  company: z.object({
    name: z.string().min(1),
    canonicalName: z.string().nullable(),
    tagline: z.string(),
    description: z.string(),
    website: z.string(),
    websiteHost: z.string().nullable(),
    industry: z.string(),
  }),
  round: z.object({
    stage: z.nativeEnum(StartupStage).optional(),
    fundingTarget: z.number().int().nonnegative().optional(),
    teamSize: z.number().int().positive().optional(),
  }),
  geography: z.object({
    raw: z.string(),
    normalizedRegion: z.string().nullable(),
    countryCode: z.string().nullable(),
    level1: z.string().nullable(),
    level2: z.string().nullable(),
    level3: z.string().nullable(),
    path: z.array(z.string()),
  }),
  owners: z.object({
    submittedByRole: z.nativeEnum(UserRole).optional(),
    // IDs are validated at FK constraint time — schema only enforces presence
    // and string shape so the canonical type stays stable across paths.
    submitterUserId: z.string().min(1).optional(),
    scoutId: z.string().min(1).optional(),
    portalId: z.string().min(1).nullable(),
    founderEmail: z.string().email().nullable(),
    founderName: z.string().nullable(),
  }),
  stageGate: z.object({
    status: z.nativeEnum(StartupStatus),
    isPrivate: z.boolean(),
  }),
});

export type ScreeningInputV1 = z.infer<typeof ScreeningInputV1Schema>;

export interface BuildScreeningInputV1Args {
  raw: ScreeningIntakeCandidate;
  sourcePath: StartupSourcePath;
  status?: StartupStatus;
  isPrivate?: boolean;
  stage?: StartupStage;
  fundingTarget?: number;
  teamSize?: number;
  submittedByRole?: UserRole;
  submitterUserId?: string;
  scoutId?: string;
  portalId?: string;
  founderEmail?: string;
  founderName?: string;
}

/**
 * Build a `ScreeningInputV1` from any intake DTO. Defers to
 * `normalizeScreeningIntakeCandidate` for the textual fields so the canonical
 * type stays in lockstep with the legacy helper.
 *
 * Returns a parsed object — callers can either destructure or pass it to the
 * DB insert. The parse step is the contract check.
 */
export function buildScreeningInputV1(
  args: BuildScreeningInputV1Args,
): ScreeningInputV1 {
  const base = normalizeScreeningIntakeCandidate(args.raw);
  const geography = deriveStartupGeography(base.location);

  const candidate: ScreeningInputV1 = {
    schemaVersion: SCREENING_INPUT_VERSION,
    sourcePath: args.sourcePath,
    company: {
      name: base.name,
      canonicalName: base.canonicalName,
      tagline: base.tagline,
      description: base.description,
      website: base.website,
      websiteHost: base.websiteHost,
      industry: base.industry,
    },
    round: {
      stage: args.stage,
      fundingTarget: args.fundingTarget,
      teamSize: args.teamSize,
    },
    geography: {
      raw: base.location,
      normalizedRegion: geography.normalizedRegion ?? null,
      countryCode: geography.countryCode,
      level1: geography.level1 ?? null,
      level2: geography.level2 ?? null,
      level3: geography.level3 ?? null,
      path: geography.path,
    },
    owners: {
      submittedByRole: args.submittedByRole,
      submitterUserId: args.submitterUserId,
      scoutId: args.scoutId,
      portalId: args.portalId ?? null,
      founderEmail: args.founderEmail ?? null,
      founderName: args.founderName ?? null,
    },
    stageGate: {
      status: args.status ?? StartupStatus.DRAFT,
      isPrivate: args.isPrivate ?? false,
    },
  };

  // Real assertion — divergence between callers blows up here, not in the DB.
  return ScreeningInputV1Schema.parse(candidate);
}

function buildStartupNameNormalizationExpression() {
  return sql<string>`trim(regexp_replace(
    regexp_replace(
      replace(lower(${startup.name}), '&', ' and '),
      '\\m(incorporated|inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|sarl|sa|sas)\\M',
      ' ',
      'gi'
    ),
    '[^a-z0-9]+',
    ' ',
    'g'
  ))`;
}

function buildStartupWebsiteHostExpression() {
  return sql<string>`trim(split_part(
    regexp_replace(
      regexp_replace(replace(lower(${startup.website}), 'www.', ''), '^https?://', ''),
      '[?#].*$',
      ''
    ),
    '/',
    1
  ))`;
}

export async function findCanonicalStartupDuplicate(
  db: DrizzleService['db'],
  lookup: StartupDuplicateLookup,
): Promise<StartupDuplicateMatch | null> {
  const normalizedName = normalizeScreeningCompanyNameForDuplicateMatching(
    lookup.companyName,
  );
  const normalizedWebsiteHost = normalizeWebsiteHost(lookup.website);
  const ownerFilter = lookup.ownerUserId
    ? eq(startup.userId, lookup.ownerUserId)
    : undefined;

  if (normalizedName) {
    const nameExpression = buildStartupNameNormalizationExpression();
    const [nameMatch] = await db
      .select({
        id: startup.id,
        name: startup.name,
        website: startup.website,
        status: startup.status,
        userId: startup.userId,
      })
      .from(startup)
      .where(
        ownerFilter
          ? and(ownerFilter, sql`${nameExpression} = ${normalizedName}`)
          : sql`${nameExpression} = ${normalizedName}`,
      )
      .limit(1);

    if (nameMatch) {
      const candidateName = normalizeScreeningCompanyNameForDuplicateMatching(nameMatch.name);
      if (candidateName === normalizedName) {
        return {
          id: nameMatch.id,
          name: nameMatch.name,
          status: nameMatch.status,
          userId: nameMatch.userId,
          matchedOn: 'name',
        };
      }
    }
  }

  if (normalizedWebsiteHost) {
    const websiteExpression = buildStartupWebsiteHostExpression();
    const [websiteMatch] = await db
      .select({
        id: startup.id,
        name: startup.name,
        website: startup.website,
        status: startup.status,
        userId: startup.userId,
      })
      .from(startup)
      .where(
        ownerFilter
          ? and(ownerFilter, sql`${websiteExpression} = ${normalizedWebsiteHost}`)
          : sql`${websiteExpression} = ${normalizedWebsiteHost}`,
      )
      .limit(1);

    if (websiteMatch) {
      const candidateHost = normalizeWebsiteHost(websiteMatch.website);
      if (candidateHost === normalizedWebsiteHost) {
        return {
          id: websiteMatch.id,
          name: websiteMatch.name,
          status: websiteMatch.status,
          userId: websiteMatch.userId,
          matchedOn: 'website',
        };
      }
    }
  }

  return null;
}
