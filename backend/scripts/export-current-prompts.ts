import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/database/schema';
import * as fs from 'fs';

const EVAL_KEYS = [
  'evaluation.team', 'evaluation.market', 'evaluation.product',
  'evaluation.traction', 'evaluation.businessModel', 'evaluation.gtm',
  'evaluation.financials', 'evaluation.competitiveAdvantage',
  'evaluation.legal', 'evaluation.dealTerms', 'evaluation.exitPotential',
  'synthesis.final',
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required');

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  console.log('Exporting current published prompts...\n');

  const backup: any[] = [];

  for (const key of EVAL_KEYS) {
    const [def] = await db
      .select({ id: schema.aiPromptDefinition.id, key: schema.aiPromptDefinition.key })
      .from(schema.aiPromptDefinition)
      .where(eq(schema.aiPromptDefinition.key, key))
      .limit(1);

    if (!def) {
      console.log(`  MISSING  ${key} — no definition`);
      continue;
    }

    // Get ALL published revisions (global + per-stage)
    const revisions = await db
      .select({
        id: schema.aiPromptRevision.id,
        stage: schema.aiPromptRevision.stage,
        status: schema.aiPromptRevision.status,
        systemPrompt: schema.aiPromptRevision.systemPrompt,
        userPrompt: schema.aiPromptRevision.userPrompt,
        version: schema.aiPromptRevision.version,
        notes: schema.aiPromptRevision.notes,
        publishedAt: schema.aiPromptRevision.publishedAt,
        createdAt: schema.aiPromptRevision.createdAt,
      })
      .from(schema.aiPromptRevision)
      .where(
        and(
          eq(schema.aiPromptRevision.definitionId, def.id),
          eq(schema.aiPromptRevision.status, 'published'),
        ),
      );

    console.log(`  ${key}: ${revisions.length} published revision(s)`);
    for (const rev of revisions) {
      console.log(`    ${rev.stage ?? 'global'} v${rev.version} — sys=${rev.systemPrompt?.length ?? 0} usr=${rev.userPrompt?.length ?? 0}`);
    }

    backup.push({
      key: def.key,
      definitionId: def.id,
      revisions,
    });
  }

  const outPath = '/Users/yusufisawi/Developer/inside-line/backend/scripts/prompt-backup-before-update.json';
  fs.writeFileSync(outPath, JSON.stringify(backup, null, 2));
  console.log(`\nBackup written to: ${outPath}`);
  console.log(`Total agents: ${backup.length}`);
  console.log(`Total revisions: ${backup.reduce((sum, a) => sum + a.revisions.length, 0)}`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
