import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DrizzleService } from '../../database';
import {
  portalSubmission,
  PortalLinkIntegrity,
  PortalSubmissionAuditOutcome,
  portalSubmissionAudit,
  NewPortalSubmissionAudit,
  PortalSubmissionAudit,
} from './entities';
import { startup } from '../startup/entities/startup.schema';

/**
 * Public-portal abuse-prevention rules (DS-E1-F7-S1).
 *
 * V1 implementation queries the `portal_submission_audit` table — counting
 * recent rows is plenty fast given the composite indexes, and it lets us reuse
 * the same storage for both rate-limit accounting and the admin audit view.
 *
 * Redis-based bucketing is documented as a future optimisation; switching is
 * a one-method change inside this service and won't ripple into callers.
 */

export type RateLimitDecision =
  | { kind: 'allow' }
  | {
      kind: 'rate_limited';
      reason: 'per_ip_burst' | 'per_email_window';
      retryAfterSeconds: number;
      message: string;
    }
  | {
      kind: 'duplicate_within_window';
      matchedStartupId: string;
      message: string;
    };

export interface CheckSubmissionAttemptInput {
  portalId: string;
  linkIntegrity: PortalLinkIntegrity;
  founderEmailHash: string;
  ipAddress: string | null;
  normalizedCompanyName: string | null;
}

@Injectable()
export class SubmissionRateLimitService {
  private readonly logger = new Logger(SubmissionRateLimitService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly config: ConfigService,
  ) {}

  private get ipBurstLimit(): number {
    return this.config.get<number>('PORTAL_RATE_LIMIT_IP_PER_5MIN', 10);
  }

  private get ipBurstWindowSeconds(): number {
    return this.config.get<number>('PORTAL_RATE_LIMIT_IP_WINDOW_SECONDS', 300);
  }

  private get emailWindowLimit(): number {
    return this.config.get<number>('PORTAL_RATE_LIMIT_EMAIL_PER_30D', 5);
  }

  private get dedupeWindowDays(): number {
    return this.config.get<number>('PORTAL_DEDUPE_WINDOW_DAYS', 30);
  }

  /**
   * Decide what to do with a public submission attempt. Does NOT write the
   * audit row — the caller writes it (so the `accepted` path can backfill the
   * newly-created startupId on the same row). Blocked paths should call
   * `recordOutcome()` to keep the audit trail honest.
   */
  async checkAttempt(
    input: CheckSubmissionAttemptInput,
  ): Promise<RateLimitDecision> {
    // 1) Per-IP burst — checked for every posture (defense in depth even on
    //    lenient portals, since bots get all postures).
    if (input.ipAddress) {
      const limit = this.ipBurstLimit;
      const windowSeconds = this.ipBurstWindowSeconds;
      const since = new Date(Date.now() - windowSeconds * 1000);
      const [row] = await this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(portalSubmissionAudit)
        .where(
          and(
            eq(portalSubmissionAudit.ipAddress, input.ipAddress),
            gte(portalSubmissionAudit.createdAt, since),
          ),
        );
      if (row && row.count >= limit) {
        return {
          kind: 'rate_limited',
          reason: 'per_ip_burst',
          retryAfterSeconds: windowSeconds,
          message:
            'Too many submissions from this network in a short window. Please wait a few minutes and try again.',
        };
      }
    }

    // 2) Per-email and canonical-name dedupe — only on `strict` portals.
    if (input.linkIntegrity === PortalLinkIntegrity.STRICT) {
      const windowDays = this.dedupeWindowDays;
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

      // 2a) Per-email rate limit inside the window.
      const [emailRow] = await this.drizzle.db
        .select({ count: sql<number>`count(*)::int` })
        .from(portalSubmissionAudit)
        .where(
          and(
            eq(portalSubmissionAudit.portalId, input.portalId),
            eq(portalSubmissionAudit.founderEmailHash, input.founderEmailHash),
            eq(
              portalSubmissionAudit.outcome,
              PortalSubmissionAuditOutcome.ACCEPTED,
            ),
            gte(portalSubmissionAudit.createdAt, since),
          ),
        );
      if (emailRow && emailRow.count >= this.emailWindowLimit) {
        return {
          kind: 'rate_limited',
          reason: 'per_email_window',
          retryAfterSeconds: windowDays * 24 * 60 * 60,
          message: `You've already submitted ${emailRow.count} times to this portal in the last ${windowDays} days. The fund will reach out if they want to chat.`,
        };
      }

      // 2b) Canonical-name dedupe — scoped to this portal's submissions in
      //     the window.
      if (input.normalizedCompanyName) {
        const matched = await this.findRecentNormalizedNameMatch({
          portalId: input.portalId,
          normalizedCompanyName: input.normalizedCompanyName,
          since,
        });
        if (matched) {
          return {
            kind: 'duplicate_within_window',
            matchedStartupId: matched.startupId,
            message:
              "Looks like you've already submitted this company. We'll be in touch — no need to send it again.",
          };
        }
      }
    }

    return { kind: 'allow' };
  }

  /**
   * Insert a row into `portal_submission_audit`. Idempotent enough — duplicate
   * inserts are harmless (it's append-only) but we log if anything fails so
   * an audit gap is visible.
   */
  async recordOutcome(
    row: NewPortalSubmissionAudit,
  ): Promise<PortalSubmissionAudit | null> {
    try {
      const [inserted] = await this.drizzle.db
        .insert(portalSubmissionAudit)
        .values(row)
        .returning();
      if (row.outcome !== PortalSubmissionAuditOutcome.ACCEPTED) {
        this.logger.warn(
          `Portal abuse-prevention: portal=${row.portalId} outcome=${row.outcome} emailHashPrefix=${row.founderEmailHash.slice(0, 8)} ip=${row.ipAddress ?? 'unknown'}`,
        );
      }
      return inserted ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to write portal_submission_audit row (portal=${row.portalId}, outcome=${row.outcome}): ${message}`,
      );
      return null;
    }
  }

  /**
   * Hunt for a recent startup on this portal whose `name` normalises to the
   * same canonical form. Implemented in JS rather than as a single SQL query
   * because the normalization is non-trivial (legal suffixes, ampersand
   * handling) and porting it to SQL would diverge from the JS implementation —
   * `clara-submission.service.ts` already learned this lesson.
   *
   * Scoped to the portal + window, so the candidate set stays small.
   */
  private async findRecentNormalizedNameMatch(input: {
    portalId: string;
    normalizedCompanyName: string;
    since: Date;
  }): Promise<{ startupId: string } | null> {
    const candidates = await this.drizzle.db
      .select({
        startupId: portalSubmission.startupId,
        name: startup.name,
      })
      .from(portalSubmission)
      .leftJoin(startup, eq(portalSubmission.startupId, startup.id))
      .where(
        and(
          eq(portalSubmission.portalId, input.portalId),
          gte(portalSubmission.submittedAt, input.since),
        ),
      );

    for (const row of candidates) {
      if (!row.name) continue;
      const normalized = normalizeForCompare(row.name);
      if (normalized === input.normalizedCompanyName) {
        return { startupId: row.startupId };
      }
    }
    return null;
  }
}

// Local mirror of the util — kept here to avoid a circular import between
// service ↔ utils. The function is identical to `normalizeCompanyNameForMatch`
// in `utils/submission-canonical.ts`; tests assert they stay in sync.
function normalizeForCompare(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed
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
