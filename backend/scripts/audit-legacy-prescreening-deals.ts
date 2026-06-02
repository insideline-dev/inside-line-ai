/**
 * READ-ONLY audit — legacy deals affected by the COALESCE(..., 'advance') removal.
 *
 * Commit 03a37554 changed the "is this deal in Due Diligence?" predicate from
 *   COALESCE((latest screening decision), 'advance') = 'advance'
 * to
 *   (latest screening decision) = 'advance'
 * so startups with NO screening_decision row (legacy deals that entered DD before
 * screening existed) are now silently excluded from DD counts and post-screening
 * lists. This script reports how many such deals exist so you can decide whether
 * to backfill an 'advance' decision for them.
 *
 * DB selection mirrors drizzle.config.ts (DEV_DATABASE_URL when NODE_ENV=development).
 *
 * Usage (from backend/):
 *   bun run scripts/audit-legacy-prescreening-deals.ts
 *   NODE_ENV=development bun run scripts/audit-legacy-prescreening-deals.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../src/database/schema';

function getDatabaseUrl(): string {
  const url =
    process.env.NODE_ENV === 'development' && process.env.DEV_DATABASE_URL
      ? process.env.DEV_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!url) throw new Error('No database URL (set DATABASE_URL or DEV_DATABASE_URL)');
  return url;
}

async function main() {
  const target =
    process.env.NODE_ENV === 'development' && process.env.DEV_DATABASE_URL
      ? 'DEV_DATABASE_URL (dev)'
      : 'DATABASE_URL (default/prod)';
  console.log(`\n🔍 Legacy pre-screening DD audit — target: ${target}\n`);

  const client = postgres(getDatabaseUrl());
  const db = drizzle(client, { schema });

  try {
    const { startup, screeningDecision } = schema;

    // Startups with NO screening_decision row at all (the legacy/bypassed set),
    // grouped by status — these used to count as 'advance' (in DD) and now don't.
    const noDecision = await db.execute(sql`
      SELECT ${startup.status} AS status, COUNT(*)::int AS count
      FROM ${startup}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${screeningDecision}
        WHERE ${screeningDecision.startupId} = ${startup.id}
      )
      GROUP BY ${startup.status}
      ORDER BY count DESC
    `);

    // Of those, how many would previously have shown in DD views — i.e. ones in a
    // post-screening-ish status (approved / analyzing). Adjust if your DD lists use
    // different statuses; this is the headline "now-hidden" number.
    const rows = noDecision as unknown as Array<{ status: string; count: number }>;
    const total = rows.reduce((s, r) => s + Number(r.count), 0);

    console.log(`Startups with NO screening_decision row: ${total}`);
    if (rows.length === 0) {
      console.log('  (none — nothing was hidden by the COALESCE removal) ✅');
    } else {
      for (const r of rows) {
        console.log(`  • ${r.status.padEnd(14)} ${r.count}`);
      }
      const postScreening = rows
        .filter((r) => r.status === 'approved' || r.status === 'analyzing')
        .reduce((s, r) => s + Number(r.count), 0);
      console.log(`\n⚠️  ${postScreening} of these are 'approved'/'analyzing' — these are the deals now silently dropped from DD counts/lists.`);
      console.log(`    If any are real live deals, backfill an 'advance' screening_decision for them (via Drizzle, not raw SQL writes).`);
    }

    // For context: latest decision distribution among startups that DO have decisions.
    const dist = await db.execute(sql`
      SELECT latest.classification, COUNT(*)::int AS count
      FROM (
        SELECT DISTINCT ON (${screeningDecision.startupId})
          ${screeningDecision.startupId} AS startup_id,
          ${screeningDecision.classification} AS classification
        FROM ${screeningDecision}
        ORDER BY ${screeningDecision.startupId}, ${screeningDecision.createdAt} DESC
      ) latest
      GROUP BY latest.classification
      ORDER BY count DESC
    `);
    const distRows = dist as unknown as Array<{ classification: string; count: number }>;
    console.log(`\nLatest screening decision distribution (deals that HAVE a decision):`);
    if (distRows.length === 0) console.log('  (none)');
    for (const r of distRows) console.log(`  • ${String(r.classification).padEnd(14)} ${r.count}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
