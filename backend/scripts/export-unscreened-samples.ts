/**
 * Export + purge startups that have NO screening_decision yet (the
 * "pre-screening" / never-screened set). Each is written to ../test-samples/
 * as a SUBMISSION.json (+ deck PDF when downloadable), then optionally deleted
 * from the dev DB.
 *
 * DB selection mirrors drizzle.config.ts (DEV_DATABASE_URL when NODE_ENV=development).
 *
 * Usage (from backend/):
 *   NODE_ENV=development bun run scripts/export-unscreened-samples.ts            # dry-run: list only
 *   NODE_ENV=development bun run scripts/export-unscreened-samples.ts --export   # write SUBMISSION.json + decks
 *   NODE_ENV=development bun run scripts/export-unscreened-samples.ts --export --delete  # then purge from DB
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql, inArray, eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '../src/database/schema';

function getDatabaseUrl(): string {
  const url =
    process.env.NODE_ENV === 'development' && process.env.DEV_DATABASE_URL
      ? process.env.DEV_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!url) throw new Error('No database URL (set DATABASE_URL or DEV_DATABASE_URL)');
  return url;
}

const DO_EXPORT = process.argv.includes('--export');
const DO_DELETE = process.argv.includes('--delete');
const SAMPLES_DIR = join(__dirname, '..', '..', 'test-samples');

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'startup';
}

async function main() {
  const target =
    process.env.NODE_ENV === 'development' && process.env.DEV_DATABASE_URL
      ? 'DEV_DATABASE_URL (dev)'
      : 'DATABASE_URL (default/prod)';
  console.log(`\n📦 Export unscreened startups — target: ${target}`);
  console.log(`   mode: ${DO_DELETE ? 'EXPORT + DELETE' : DO_EXPORT ? 'EXPORT only' : 'DRY-RUN (list only)'}\n`);

  const client = postgres(getDatabaseUrl());
  const db = drizzle(client, { schema });
  const { startup, screeningDecision } = schema;

  try {
    // Startups with NO screening_decision row at all.
    const rows = (await db
      .select()
      .from(startup)
      .where(
        sql`NOT EXISTS (SELECT 1 FROM ${screeningDecision} WHERE ${screeningDecision.startupId} = ${startup.id})`,
      )) as Array<Record<string, unknown>>;

    console.log(`Found ${rows.length} startup(s) with no screening decision:\n`);
    for (const r of rows) {
      console.log(
        `  • ${(r.name as string)?.padEnd(28)} status=${String(r.status).padEnd(14)} deck=${r.pitchDeckPath ? 'path' : r.pitchDeckUrl ? 'url' : '—'}`,
      );
    }

    if (!DO_EXPORT && !DO_DELETE) {
      console.log(`\n(dry-run) Re-run with --export to write SUBMISSION.json files.\n`);
      return;
    }

    if (DO_EXPORT) {
    // Next free index for test-samples/NN-slug
    const existing = existsSync(SAMPLES_DIR) ? readdirSync(SAMPLES_DIR) : [];
    let nextIdx =
      existing
        .map((d) => parseInt(d.split('-')[0], 10))
        .filter((n) => !Number.isNaN(n))
        .reduce((m, n) => Math.max(m, n), 0) + 1;

    const decksToFetch: Array<{ dir: string; key: string; filename: string }> = [];

    for (const r of rows) {
      const name = (r.name as string) ?? 'startup';
      const folder = `${String(nextIdx).padStart(2, '0')}-${slugify(name)}`;
      nextIdx += 1;
      const dir = join(SAMPLES_DIR, folder);
      mkdirSync(dir, { recursive: true });

      const files: string[] = [];
      const deckPath = (r.pitchDeckPath as string) || null;
      const deckUrl = (r.pitchDeckUrl as string) || null;
      const deckFilename = `${slugify(name)}_deck.pdf`;
      if (deckPath) {
        decksToFetch.push({ dir, key: deckPath, filename: deckFilename });
        files.push(deckFilename);
      }

      const submission = {
        name,
        tagline: (r.tagline as string) ?? null,
        website: (r.website as string) ?? null,
        industry: (r.industry as string) ?? null,
        stage: (r.stage as string) ?? null,
        fundingTarget: (r.fundingTarget as number) ?? null,
        location: (r.location as string) ?? null,
        contactName: (r.contactName as string) ?? null,
        contactEmail: (r.contactEmail as string) ?? null,
        teamSize: (r.teamSize as number) ?? null,
        description: (r.description as string) ?? null,
        files,
        // provenance / restore hints (not part of the original submission form)
        _meta: {
          sourceStartupId: r.id,
          status: r.status,
          slug: r.slug,
          pitchDeckPath: deckPath,
          pitchDeckUrl: deckUrl,
          exportedAt: new Date().toISOString(),
        },
      };
      writeFileSync(join(dir, 'SUBMISSION.json'), JSON.stringify(submission, null, 2));
      console.log(`  ✏️  wrote ${folder}/SUBMISSION.json`);
    }

    // Emit the deck-download manifest so a follow-up step can pull them with a
    // configured StorageService (this lightweight script has no R2 client).
    if (decksToFetch.length > 0) {
      writeFileSync(
        join(SAMPLES_DIR, '_decks-to-fetch.json'),
        JSON.stringify(decksToFetch, null, 2),
      );
      console.log(
        `\n  📄 ${decksToFetch.length} deck(s) referenced — manifest at test-samples/_decks-to-fetch.json`,
      );
    }

    } // end DO_EXPORT

    if (!DO_DELETE) {
      console.log(`\n✅ Export complete. Re-run with --delete to purge these from the DB.\n`);
      return;
    }

    // ---- DELETE (cascade-safe) ----
    const ids = rows.map((r) => r.id as string);
    if (ids.length === 0) {
      console.log('\nNothing to delete.\n');
      return;
    }
    // Null out the two FKs that are NOT ON DELETE CASCADE (would block delete).
    // agentConversation.currentStartupId and investorInboxSubmission.startupId
    // both default to NO ACTION (clara/copilot are SET NULL; everything else
    // CASCADEs).
    const { agentConversation, investorInboxSubmission } = schema;
    await db
      .update(agentConversation)
      .set({ currentStartupId: null })
      .where(inArray(agentConversation.currentStartupId, ids));
    await db
      .update(investorInboxSubmission)
      .set({ startupId: null })
      .where(inArray(investorInboxSubmission.startupId, ids));

    // Everything else references startup with ON DELETE CASCADE / SET NULL.
    let deleted = 0;
    for (const id of ids) {
      await db.delete(startup).where(eq(startup.id, id));
      deleted += 1;
    }
    console.log(`\n🗑️  Deleted ${deleted} startup(s) from the DB (cascades handled dependents).\n`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
