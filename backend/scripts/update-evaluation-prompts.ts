/**
 * Updates evaluation agent prompts from parsed Excel data.
 * Archives existing published revisions, inserts new ones as published.
 *
 * For each agent × stage: archive old published → insert new published revision.
 *
 * Run: cd backend && bun run scripts/update-evaluation-prompts.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, isNull, max } from 'drizzle-orm';
import * as schema from '../src/database/schema';
import * as fs from 'fs';
import * as path from 'path';

// Stage mapping: Excel uses kebab-case, DB uses snake_case enum
const STAGE_MAP: Record<string, string> = {
  'pre-seed': 'pre_seed',
  'seed': 'seed',
  'series-a': 'series_a',
  'series-b': 'series_b',
  'series-c': 'series_c',
  'series-d': 'series_d',
};

interface AgentPromptData {
  name: string;
  key: string;
  stages: Record<string, { systemPrompt: string; userPrompt: string }>;
}

/** Convert single-brace `{var}` to double-brace `{{var}}` for renderTemplate() compatibility. */
function fixBraces(template: string): string {
  return template.replace(/(?<!\{)\{([a-zA-Z][a-zA-Z0-9_]*)\}(?!\})/g, '{{$1}}');
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var is required');
  }

  // Load parsed prompt data
  const dataPath = path.join(__dirname, 'prompt-update-data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Prompt data not found at ${dataPath}. Run the Excel parser first.`);
  }

  const agents: AgentPromptData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Loaded ${agents.length} agents from prompt data.\n`);

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  let totalArchived = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const agent of agents) {
    console.log(`\n--- ${agent.key} (${agent.name}) ---`);

    // Look up definition
    const [def] = await db
      .select({ id: schema.aiPromptDefinition.id })
      .from(schema.aiPromptDefinition)
      .where(eq(schema.aiPromptDefinition.key, agent.key))
      .limit(1);

    if (!def) {
      console.log(`  SKIP  definition not found for key: ${agent.key}`);
      totalSkipped++;
      continue;
    }

    for (const [excelStage, prompts] of Object.entries(agent.stages)) {
      const dbStage = STAGE_MAP[excelStage];
      if (!dbStage) {
        console.log(`  SKIP  unknown stage: ${excelStage}`);
        totalSkipped++;
        continue;
      }

      if (!prompts.systemPrompt && !prompts.userPrompt) {
        console.log(`  SKIP  empty prompts for ${agent.key} @ ${dbStage}`);
        totalSkipped++;
        continue;
      }

      const stageCondition = eq(schema.aiPromptRevision.stage, dbStage as never);

      // 1. Archive existing published revision for this key+stage
      const archived = await db
        .update(schema.aiPromptRevision)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(
          and(
            eq(schema.aiPromptRevision.definitionId, def.id),
            eq(schema.aiPromptRevision.status, 'published'),
            stageCondition,
          ),
        )
        .returning({ id: schema.aiPromptRevision.id });

      if (archived.length > 0) {
        console.log(`  ARCHIVE  ${agent.key} @ ${dbStage} (${archived.length} revision(s))`);
        totalArchived += archived.length;
      }

      // 2. Get next version number
      const [maxRow] = await db
        .select({ value: max(schema.aiPromptRevision.version) })
        .from(schema.aiPromptRevision)
        .where(
          and(
            eq(schema.aiPromptRevision.definitionId, def.id),
            stageCondition,
          ),
        );

      const nextVersion = (maxRow?.value ?? 0) + 1;

      // 3. Insert new published revision
      await db.insert(schema.aiPromptRevision).values({
        definitionId: def.id,
        stage: dbStage as never,
        status: 'published',
        systemPrompt: prompts.systemPrompt,
        userPrompt: fixBraces(prompts.userPrompt),
        notes: `Updated from Excel prompts (v${nextVersion})`,
        version: nextVersion,
        publishedAt: new Date(),
      });

      console.log(`  INSERT  ${agent.key} @ ${dbStage} (v${nextVersion})`);
      totalInserted++;
    }
  }

  // Verification
  console.log('\n\n=== VERIFICATION ===\n');

  const allKeys = agents.map((a) => a.key);
  const dbStages = Object.values(STAGE_MAP);

  for (const key of allKeys) {
    const [def] = await db
      .select({ id: schema.aiPromptDefinition.id })
      .from(schema.aiPromptDefinition)
      .where(eq(schema.aiPromptDefinition.key, key))
      .limit(1);

    if (!def) {
      console.log(`  MISSING  ${key} — no definition`);
      continue;
    }

    for (const stage of dbStages) {
      const [rev] = await db
        .select({
          id: schema.aiPromptRevision.id,
          version: schema.aiPromptRevision.version,
          sysLen: schema.aiPromptRevision.systemPrompt,
          usrLen: schema.aiPromptRevision.userPrompt,
        })
        .from(schema.aiPromptRevision)
        .where(
          and(
            eq(schema.aiPromptRevision.definitionId, def.id),
            eq(schema.aiPromptRevision.status, 'published'),
            eq(schema.aiPromptRevision.stage, stage as never),
          ),
        )
        .limit(1);

      if (rev) {
        console.log(
          `  OK  ${key} @ ${stage} v${rev.version} (sys=${rev.sysLen?.length ?? 0}, usr=${rev.usrLen?.length ?? 0})`,
        );
      } else {
        console.log(`  MISSING  ${key} @ ${stage} — no published revision`);
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`  Archived: ${totalArchived}`);
  console.log(`  Inserted: ${totalInserted}`);
  console.log(`  Skipped:  ${totalSkipped}`);

  await client.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
