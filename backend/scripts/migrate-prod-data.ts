/**
 * Production Data Migration Script
 *
 * Migrates data from old production DB (SERIAL int IDs) to new DB (UUID IDs).
 * Uses raw pg (node-postgres) for both connections.
 *
 * Usage:
 *   bun run backend/scripts/migrate-prod-data.ts
 *   bun run backend/scripts/migrate-prod-data.ts --dry-run
 *
 * Environment:
 *   PROD_DATABASE_URL  — old prod DB (read-only)
 *   DATABASE_URL       — new DB (writes)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

// ─── CLI Args ────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const BACKUP_PATH = path.resolve(import.meta.dir, 'migration-backup.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deterministicUUID(table: string, oldId: number | string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${table}:${oldId}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function jsonbToTextArray(val: unknown): string[] | null {
  if (!val) return null;
  if (Array.isArray(val)) return val.map(String);
  return null;
}

/** Safely JSON.stringify for parameterized jsonb inserts. Returns null for nullish values. */
function toJsonb(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return typeof val === 'string' ? val : JSON.stringify(val);
}

const VALID_AGENT_CATEGORIES = ['orchestrator', 'analysis', 'synthesis'] as const;
const VALID_DECISIONS = ['approved', 'rejected', 'needs_revision'] as const;

function mapAgentCategory(raw: string | null): string {
  if (raw && (VALID_AGENT_CATEGORIES as readonly string[]).includes(raw)) return raw;
  return 'analysis';
}

function mapDecision(raw: string | null): string | null {
  if (raw && (VALID_DECISIONS as readonly string[]).includes(raw)) return raw;
  return null;
}

function mapNotificationType(raw: string): string {
  const m: Record<string, string> = {
    analysis_complete: 'success',
    startup_approved: 'success',
    startup_rejected: 'warning',
    new_match: 'match',
    system: 'info',
  };
  return m[raw] || 'info';
}

function mapMatchStatus(raw: string | null): string {
  const m: Record<string, string> = {
    new: 'new',
    reviewing: 'reviewing',
    interested: 'reviewing',
    watchlist: 'reviewing',
    passed: 'passed',
  };
  return (raw && m[raw]) || 'new';
}

function log(msg: string) {
  console.log(`[migrate] ${msg}`);
}

function logTable(label: string, rows: Array<{ table: string; extracted: number; inserted: number }>) {
  console.log(`\n${label}`);
  console.log('─'.repeat(55));
  console.log(`${'Table'.padEnd(35)} ${'Old'.padStart(6)} ${'New'.padStart(6)}`);
  console.log('─'.repeat(55));
  for (const r of rows) {
    console.log(`${r.table.padEnd(35)} ${String(r.extracted).padStart(6)} ${String(r.inserted).padStart(6)}`);
  }
  console.log('─'.repeat(55));
}

// ─── Extract ─────────────────────────────────────────────────────────────────

const OLD_TABLES = [
  'stage_scoring_weights',
  'agent_prompts',
  'agent_inboxes',
  'startups',
  'startup_evaluations',
  'admin_reviews',
  'investor_profiles',
  'investment_theses',
  'investor_matches',
  'investor_scoring_preferences',
  'notifications',
  'linkedin_profile_cache',
  'startup_drafts',
  'investor_portal_settings',
  'agent_conversations',
  'agent_messages',
  'attachment_downloads',
  'scout_applications',
  'team_invites',
  'team_members',
] as const;

type OldData = Record<string, Record<string, unknown>[]>;

async function extractAll(oldPool: pg.Pool): Promise<OldData> {
  const data: OldData = {};
  for (const table of OLD_TABLES) {
    const res = await oldPool.query(`SELECT * FROM ${table}`);
    data[table] = res.rows;
    log(`  extracted ${table}: ${res.rows.length} rows`);
  }
  return data;
}

// ─── Transform & Insert ──────────────────────────────────────────────────────

async function migrateAll(
  newPool: pg.Pool,
  data: OldData,
  firstUserId: string,
): Promise<Array<{ table: string; extracted: number; inserted: number }>> {
  const client = await newPool.connect();
  const stats: Array<{ table: string; extracted: number; inserted: number }> = [];

  // Build investor_profile_id → thesis_id map from old data
  const profileToThesis = new Map<number, number>();
  for (const t of data.investment_theses) {
    const investorId = t.investor_id as number;
    if (!profileToThesis.has(investorId)) {
      profileToThesis.set(investorId, t.id as number);
    }
  }

  // Build founder_id → startup id map from old data (for startup_drafts)
  const founderToStartup = new Map<string, number>();
  for (const s of data.startups) {
    const fid = s.founder_id as string;
    if (fid && !founderToStartup.has(fid)) {
      founderToStartup.set(fid, s.id as number);
    }
  }

  // Track slugs for dedup
  const usedSlugs = new Set<string>();
  function uniqueSlug(name: string, id: number): string {
    let s = slugify(name || 'startup');
    if (!s) s = 'startup';
    if (usedSlugs.has(s)) s = `${s}-${id}`;
    usedSlugs.add(s);
    return s;
  }

  try {
    await client.query('BEGIN');

    // 1. stage_scoring_weights
    {
      const rows = data.stage_scoring_weights;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO stage_scoring_weights (id, stage, weights, rationale, overall_rationale, last_modified_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
           ON CONFLICT (stage) DO NOTHING`,
          [
            deterministicUUID('stage_scoring_weights', r.id as number),
            r.stage,
            toJsonb(r.weights),
            toJsonb(r.rationale),
            r.overall_rationale ?? null,
            null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'stage_scoring_weights', extracted: rows.length, inserted });
      log(`  stage_scoring_weights: ${inserted}/${rows.length}`);
    }

    // 2. agent_prompts
    {
      const rows = data.agent_prompts;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO agent_prompts (id, agent_key, display_name, description, category, system_prompt, human_prompt, tools, inputs, outputs, parent_agent, execution_order, is_parallel, version, last_modified_by, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
           ON CONFLICT (agent_key) DO NOTHING`,
          [
            deterministicUUID('agent_prompts', r.id as number),
            r.agent_key,
            r.display_name ?? null,
            r.description ?? null,
            mapAgentCategory(r.category as string | null),
            r.system_prompt ?? null,
            r.human_prompt ?? null,
            toJsonb(r.tools),
            toJsonb(r.inputs),
            toJsonb(r.outputs),
            r.parent_agent ?? null,
            r.execution_order ?? null,
            r.is_parallel ?? false,
            r.version ?? 1,
            null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'agent_prompts', extracted: rows.length, inserted });
      log(`  agent_prompts: ${inserted}/${rows.length}`);
    }

    // 3. agent_inboxes
    {
      const rows = data.agent_inboxes;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO agent_inboxes (id, agentmail_inbox_id, email_address, twilio_phone_number, is_active, welcome_message, auto_reply_enabled, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('agent_inboxes', r.id as number),
            r.agentmail_inbox_id ?? null,
            r.email_address ?? null,
            r.twilio_phone_number ?? null,
            r.is_active ?? true,
            r.welcome_message ?? null,
            r.auto_reply_enabled ?? false,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'agent_inboxes', extracted: rows.length, inserted });
      log(`  agent_inboxes: ${inserted}/${rows.length}`);
    }

    // 4. startups
    {
      const rows = data.startups;
      let inserted = 0;
      for (const r of rows) {
        const id = r.id as number;
        const slug = uniqueSlug(r.name as string, id);
        const res = await client.query(
          `INSERT INTO startups (
            id, user_id, submitted_by_role, scout_id, is_private,
            name, slug, tagline, description, website,
            location, industry, sector_industry_group, sector_industry,
            stage, funding_target, team_size, status,
            round_currency, valuation, valuation_known, valuation_type,
            raise_type, lead_secured, lead_investor_name,
            contact_name, contact_email, contact_phone, contact_phone_country_code,
            has_previous_funding, previous_funding_amount, previous_funding_currency,
            previous_investors, previous_round_type,
            overall_score, percentile_rank,
            product_description, technology_readiness_level,
            pitch_deck_url, pitch_deck_path, files,
            team_members, product_screenshots, demo_video_url,
            normalized_region,
            created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,
            $11,$12,$13,$14,
            $15,$16,$17,$18,
            $19,$20,$21,$22,
            $23,$24,$25,
            $26,$27,$28,$29,
            $30,$31,$32,
            $33,$34,
            $35,$36,
            $37,$38,
            $39,$40,$41,
            $42,$43,$44,
            $45,
            NOW(),NOW()
          ) ON CONFLICT (slug) DO NOTHING`,
          [
            deterministicUUID('startups', id),
            firstUserId,
            r.submitted_by_role ?? null,
            null, // scout_id can't map
            r.is_private ?? false,
            r.name || 'Untitled',
            slug,
            ((r.description as string) || (r.name as string) || 'No tagline').slice(0, 100),
            r.description || '',
            r.website || '',
            r.location || 'Unknown',
            (r.sector_industry_group as string) || (r.sector as string) || 'Other',
            r.sector_industry_group ?? null,
            r.sector_industry ?? null,
            r.stage || 'pre_seed',
            Math.round((r.round_size as number) || 0),
            1, // team_size default
            r.status || 'submitted',
            r.round_currency ?? null,
            r.valuation ?? null,
            r.valuation_known ?? null,
            r.valuation_type ?? null,
            r.raise_type ?? null,
            r.lead_secured ?? null,
            r.lead_investor_name ?? null,
            r.contact_name ?? null,
            r.contact_email ?? null,
            r.contact_phone ?? null,
            r.contact_phone_country_code ?? null,
            r.has_previous_funding ?? null,
            r.previous_funding_amount ?? null,
            r.previous_funding_currency ?? null,
            r.previous_investors ?? null,
            r.previous_round_type ?? null,
            r.overall_score ?? null,
            r.percentile_rank ?? null,
            r.product_description ?? null,
            r.technology_readiness_level ?? null,
            r.pitch_deck_url ?? null,
            r.pitch_deck_path ?? null,
            toJsonb(r.files),
            toJsonb(r.team_members),
            toJsonb(r.product_screenshots),
            r.demo_video_url ?? null,
            r.normalized_region ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'startups', extracted: rows.length, inserted });
      log(`  startups: ${inserted}/${rows.length}`);
    }

    // 5. startup_evaluations
    {
      const rows = data.startup_evaluations;
      let inserted = 0;
      for (const r of rows) {
        // Get all column names except id and startup_id to pass through
        const knownKeys = ['id', 'startup_id', 'created_at', 'updated_at'];
        const extraCols: string[] = [];
        const extraVals: unknown[] = [];
        let paramIdx = 3; // $1=id, $2=startup_id

        for (const [key, val] of Object.entries(r)) {
          if (knownKeys.includes(key)) continue;
          extraCols.push(key);
          paramIdx++;
          // jsonb columns need stringify — handle objects AND arrays
          if (val !== null && val !== undefined && typeof val === 'object' && !(val instanceof Date)) {
            extraVals.push(JSON.stringify(val));
          } else {
            extraVals.push(val ?? null);
          }
        }

        const colList = ['id', 'startup_id', ...extraCols, 'created_at', 'updated_at'].join(', ');
        const paramList = [
          '$1', '$2',
          ...extraCols.map((_, i) => `$${i + 3}`),
          'NOW()', 'NOW()',
        ].join(', ');

        const res = await client.query(
          `INSERT INTO startup_evaluations (${colList}) VALUES (${paramList})
           ON CONFLICT (startup_id) DO NOTHING`,
          [
            deterministicUUID('startup_evaluations', r.id as number),
            deterministicUUID('startups', r.startup_id as number),
            ...extraVals,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'startup_evaluations', extracted: rows.length, inserted });
      log(`  startup_evaluations: ${inserted}/${rows.length}`);
    }

    // 6. admin_reviews
    {
      const rows = data.admin_reviews;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO admin_reviews (id, startup_id, reviewer_id, score_override, memo_edits, admin_notes, flagged_concerns, investor_visibility, decision, reviewed_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('admin_reviews', r.id as number),
            deterministicUUID('startups', r.startup_id as number),
            firstUserId,
            r.score_override ?? null,
            toJsonb(r.memo_edits),
            r.admin_notes ?? null,
            toJsonb(r.flagged_concerns),
            toJsonb(r.investor_visibility),
            mapDecision(r.decision as string | null),
            r.reviewed_at ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'admin_reviews', extracted: rows.length, inserted });
      log(`  admin_reviews: ${inserted}/${rows.length}`);
    }

    // 7. investor_profiles
    {
      const rows = data.investor_profiles;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO investor_profiles (id, user_id, fund_name, fund_description, aum, team_size, website, logo_url, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [
            deterministicUUID('investor_profiles', r.id as number),
            firstUserId,
            r.fund_name ?? null,
            r.fund_description ?? null,
            r.aum ?? null,
            r.team_size ?? null,
            r.website ?? null,
            r.logo_url ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'investor_profiles', extracted: rows.length, inserted });
      log(`  investor_profiles: ${inserted}/${rows.length}`);
    }

    // 8. investment_theses → investor_theses
    {
      const rows = data.investment_theses;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO investor_theses (
            id, user_id, stages, check_size_min, check_size_max,
            industries, geographic_focus, business_models,
            min_revenue, min_growth_rate, min_team_size,
            thesis_narrative, anti_portfolio, website, fund_size,
            thesis_summary, portfolio_companies, thesis_summary_generated_at,
            is_active, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
           ON CONFLICT (user_id) DO NOTHING`,
          [
            deterministicUUID('investment_theses', r.id as number),
            firstUserId,
            jsonbToTextArray(r.stages),
            r.check_size_min ?? null,
            r.check_size_max ?? null,
            jsonbToTextArray(r.sectors),
            jsonbToTextArray(r.geographies),
            jsonbToTextArray(r.business_models),
            r.min_revenue ?? null,
            r.min_growth_rate ?? null,
            r.min_team_size ?? null,
            r.thesis_narrative ?? null,
            r.anti_portfolio ?? null,
            r.website ?? null,
            r.fund_size ?? null,
            r.thesis_summary ?? null,
            toJsonb(r.portfolio_companies),
            r.thesis_summary_generated_at ?? null,
            true,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'investor_theses', extracted: rows.length, inserted });
      log(`  investor_theses: ${inserted}/${rows.length}`);
    }

    // 9. investor_matches → startup_matches
    {
      const rows = data.investor_matches;
      let inserted = 0;
      for (const r of rows) {
        const status = mapMatchStatus(r.status as string | null);
        const res = await client.query(
          `INSERT INTO startup_matches (
            id, investor_id, startup_id, thesis_fit_score, fit_rationale,
            overall_score, status, pass_notes, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('investor_matches', r.id as number),
            firstUserId,
            deterministicUUID('startups', r.startup_id as number),
            r.thesis_fit_score ?? null,
            r.fit_rationale ?? null,
            (r.thesis_fit_score as number) || 0,
            status,
            status === 'passed' ? (r.notes ?? null) : null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'startup_matches', extracted: rows.length, inserted });
      log(`  startup_matches: ${inserted}/${rows.length}`);
    }

    // 10. investor_scoring_preferences
    {
      const rows = data.investor_scoring_preferences;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO investor_scoring_preferences (id, investor_id, stage, use_custom_weights, custom_weights, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('investor_scoring_preferences', r.id as number),
            firstUserId,
            r.stage ?? null,
            r.use_custom_weights ?? false,
            toJsonb(r.custom_weights),
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'investor_scoring_preferences', extracted: rows.length, inserted });
      log(`  investor_scoring_preferences: ${inserted}/${rows.length}`);
    }

    // 11. notifications
    {
      const rows = data.notifications;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO notifications (id, user_id, type, title, message, link, read, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('notifications', r.id as number),
            firstUserId,
            mapNotificationType(r.type as string),
            r.title ?? null,
            r.message ?? null,
            null, // link — old schema used startup_id reference
            r.is_read ?? false,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'notifications', extracted: rows.length, inserted });
      log(`  notifications: ${inserted}/${rows.length}`);
    }

    // 12. linkedin_profile_cache → linkedin_profile_caches
    {
      const rows = data.linkedin_profile_cache;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO linkedin_profile_caches (id, user_id, linkedin_url, linkedin_identifier, profile_data, fetched_at, expires_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (linkedin_url) DO NOTHING`,
          [
            deterministicUUID('linkedin_profile_cache', r.id as number),
            firstUserId,
            r.linkedin_url ?? '',
            r.linkedin_identifier ?? '',
            toJsonb(r.profile_data),
            r.fetched_at ?? null,
            r.expires_at ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'linkedin_profile_caches', extracted: rows.length, inserted });
      log(`  linkedin_profile_caches: ${inserted}/${rows.length}`);
    }

    // 13. startup_drafts
    {
      const rows = data.startup_drafts;
      let inserted = 0;
      let skipped = 0;
      for (const r of rows) {
        const founderId = r.founder_id as string;
        const startupId = founderToStartup.get(founderId);
        if (!startupId) {
          skipped++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO startup_drafts (id, startup_id, user_id, draft_data, created_at, updated_at)
           VALUES ($1,$2,$3,$4,NOW(),NOW())
           ON CONFLICT (startup_id) DO NOTHING`,
          [
            deterministicUUID('startup_drafts', r.id as number),
            deterministicUUID('startups', startupId),
            firstUserId,
            toJsonb(r.form_data),
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      if (skipped > 0) log(`  startup_drafts: skipped ${skipped} (no matching startup)`);
      stats.push({ table: 'startup_drafts', extracted: rows.length, inserted });
      log(`  startup_drafts: ${inserted}/${rows.length}`);
    }

    // 14. investor_portal_settings → portals
    {
      const rows = data.investor_portal_settings;
      // Build investor_id → fund_name lookup
      const investorFundName = new Map<number, string>();
      for (const ip of data.investor_profiles) {
        investorFundName.set(ip.id as number, (ip.fund_name as string) || 'Portal');
      }

      let inserted = 0;
      for (const r of rows) {
        const portalName = investorFundName.get(r.investor_id as number) || 'Portal';
        const res = await client.query(
          `INSERT INTO portals (id, user_id, name, slug, description, logo_url, brand_color, is_active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
           ON CONFLICT (slug) DO NOTHING`,
          [
            deterministicUUID('investor_portal_settings', r.id as number),
            firstUserId,
            portalName,
            r.slug ?? slugify(portalName),
            r.welcome_message ?? r.tagline ?? null,
            null,
            r.accent_color ?? null,
            r.is_enabled ?? true,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'portals', extracted: rows.length, inserted });
      log(`  portals: ${inserted}/${rows.length}`);
    }

    // 15. agent_conversations
    {
      const rows = data.agent_conversations;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO agent_conversations (
            id, investor_profile_id, sender_email, sender_phone, sender_name,
            email_thread_id, whatsapp_thread_id, status, last_message_at,
            current_startup_id, context, message_count, is_authenticated,
            created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('agent_conversations', r.id as number),
            r.investor_profile_id
              ? deterministicUUID('investor_profiles', r.investor_profile_id as number)
              : null,
            r.sender_email ?? null,
            r.sender_phone ?? null,
            r.sender_name ?? null,
            r.email_thread_id ?? null,
            r.whatsapp_thread_id ?? null,
            r.status ?? null,
            r.last_message_at ?? null,
            r.current_startup_id
              ? deterministicUUID('startups', r.current_startup_id as number)
              : null,
            toJsonb(r.context),
            r.message_count ?? 0,
            r.is_authenticated ?? false,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'agent_conversations', extracted: rows.length, inserted });
      log(`  agent_conversations: ${inserted}/${rows.length}`);
    }

    // 16. agent_messages
    {
      const rows = data.agent_messages;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO agent_messages (
            id, conversation_id, channel, direction, content,
            intent, extracted_entities, external_message_id,
            in_reply_to_message_id, attachments, ai_response_metadata,
            delivery_status, delivery_error,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('agent_messages', r.id as number),
            deterministicUUID('agent_conversations', r.conversation_id as number),
            r.channel ?? null,
            r.direction ?? null,
            r.content ?? null,
            r.intent ?? null,
            toJsonb(r.extracted_entities),
            r.external_message_id ?? null,
            r.in_reply_to_message_id
              ? deterministicUUID('agent_messages', r.in_reply_to_message_id as number)
              : null,
            toJsonb(r.attachments),
            toJsonb(r.ai_response_metadata),
            r.delivery_status ?? null,
            r.delivery_error ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'agent_messages', extracted: rows.length, inserted });
      log(`  agent_messages: ${inserted}/${rows.length}`);
    }

    // 17. attachment_downloads
    {
      const rows = data.attachment_downloads;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO attachment_downloads (
            id, inbox_id, message_id, attachment_id, filename,
            content_type, download_url, status, error_message,
            saved_path, file_size, completed_at,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('attachment_downloads', r.id as number),
            r.inbox_id ?? null,
            r.message_id ?? null,
            r.attachment_id ?? null,
            r.filename ?? null,
            r.content_type ?? null,
            r.download_url ?? null,
            r.status ?? null,
            r.error_message ?? null,
            r.saved_path ?? null,
            r.file_size ?? null,
            r.completed_at ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'attachment_downloads', extracted: rows.length, inserted });
      log(`  attachment_downloads: ${inserted}/${rows.length}`);
    }

    // 18. scout_applications
    {
      const rows = data.scout_applications;
      let inserted = 0;
      for (const r of rows) {
        const res = await client.query(
          `INSERT INTO scout_applications (
            id, user_id, investor_id, name, email, linkedin_url,
            experience, motivation, dealflow_sources,
            status, reviewed_by, rejection_reason, reviewed_at,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('scout_applications', r.id as number),
            firstUserId,
            firstUserId,
            r.name ?? null,
            r.email ?? null,
            r.linkedin_url ?? null,
            r.experience ?? null,
            r.motivation ?? null,
            r.dealflow_sources ?? null,
            r.status ?? null,
            null, // reviewed_by can't map
            r.review_notes ?? null,
            r.reviewed_at ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      stats.push({ table: 'scout_applications', extracted: rows.length, inserted });
      log(`  scout_applications: ${inserted}/${rows.length}`);
    }

    // 19. team_invites
    {
      const rows = data.team_invites;
      let inserted = 0;
      let skipped = 0;
      for (const r of rows) {
        const investorProfileId = r.investor_profile_id as number;
        const thesisId = profileToThesis.get(investorProfileId);
        if (!thesisId) {
          skipped++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO team_invites (
            id, investor_thesis_id, invited_by_user_id, email, role,
            status, invite_code, expires_at, accepted_by_user_id, accepted_at,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('team_invites', r.id as number),
            deterministicUUID('investment_theses', thesisId),
            firstUserId,
            r.email ?? null,
            r.role ?? 'member',
            r.status ?? null,
            r.invite_code ?? null,
            r.expires_at ?? null,
            null, // accepted_by_user_id can't map
            r.accepted_at ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      if (skipped > 0) log(`  team_invites: skipped ${skipped} (no matching thesis)`);
      stats.push({ table: 'team_invites', extracted: rows.length, inserted });
      log(`  team_invites: ${inserted}/${rows.length}`);
    }

    // 20. team_members
    {
      const rows = data.team_members;
      let inserted = 0;
      let skipped = 0;
      for (const r of rows) {
        const investorProfileId = r.investor_profile_id as number;
        const thesisId = profileToThesis.get(investorProfileId);
        if (!thesisId) {
          skipped++;
          continue;
        }
        const res = await client.query(
          `INSERT INTO team_members (
            id, investor_thesis_id, user_id, email, role, joined_at
          ) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT DO NOTHING`,
          [
            deterministicUUID('team_members', r.id as number),
            deterministicUUID('investment_theses', thesisId),
            firstUserId,
            '', // email not in old schema
            r.role ?? 'member',
            r.joined_at ?? null,
          ],
        );
        inserted += res.rowCount ?? 0;
      }
      if (skipped > 0) log(`  team_members: skipped ${skipped} (no matching thesis)`);
      stats.push({ table: 'team_members', extracted: rows.length, inserted });
      log(`  team_members: ${inserted}/${rows.length}`);
    }

    await client.query('COMMIT');
    log('Transaction committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    log('Transaction rolled back due to error.');
    throw err;
  } finally {
    client.release();
  }

  return stats;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(DRY_RUN ? 'Starting migration (DRY RUN)...' : 'Starting migration...');

  const prodUrl = process.env.PROD_DATABASE_URL;
  const newUrl = process.env.DATABASE_URL;

  if (!prodUrl) {
    console.error('Missing PROD_DATABASE_URL');
    process.exit(1);
  }
  if (!newUrl) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const oldPool = new Pool({ connectionString: prodUrl, max: 3 });
  const newPool = new Pool({ connectionString: newUrl, max: 3 });

  try {
    // Test connections
    log('Connecting to old production DB...');
    await oldPool.query('SELECT 1');
    log('Connected to old DB.');

    log('Connecting to new DB...');
    await newPool.query('SELECT 1');
    log('Connected to new DB.');

    // Get first user from new DB
    log('Fetching first user from new DB...');
    const userRes = await newPool.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    if (userRes.rows.length === 0) {
      console.error('No users found in new DB. Seed at least one user first.');
      process.exit(1);
    }
    const firstUserId = userRes.rows[0].id as string;
    log(`First user ID: ${firstUserId}`);

    // Extract all data from old DB
    log('\nExtracting data from old DB...');
    const data = await extractAll(oldPool);

    // Write backup JSON
    log(`\nWriting backup to ${BACKUP_PATH}...`);
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(data, null, 2));
    log('Backup written.');

    if (DRY_RUN) {
      log('\n--- DRY RUN SUMMARY ---');
      const summary = OLD_TABLES.map((t) => ({
        table: t,
        extracted: data[t].length,
        inserted: 0,
      }));
      logTable('Extraction Summary (no writes performed)', summary);
      log('\nDry run complete. No data was written to the new DB.');
      return;
    }

    // Transform & insert
    log('\nMigrating data to new DB...');
    const stats = await migrateAll(newPool, data, firstUserId);

    logTable('Migration Summary', stats);
    log('\nMigration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

main();
