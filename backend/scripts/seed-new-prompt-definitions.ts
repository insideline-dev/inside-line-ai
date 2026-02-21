/**
 * One-time script: seeds the 4 new prompt definitions added in Feb 2026
 * (pipeline.orchestrator, extraction.linkedin, research.orchestrator, matching.investorThesis)
 * and updates the matching.thesis system prompt with the new thesisAlignment prompt.
 *
 * Run: cd backend && bun run scripts/seed-new-prompt-definitions.ts
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../src/database/schema';
import { AI_PROMPT_CATALOG, type AiPromptKey } from '../src/modules/ai/services/ai-prompt-catalog';

const NEW_KEYS: AiPromptKey[] = [
  'pipeline.orchestrator',
  'extraction.linkedin',
  'research.orchestrator',
  'matching.investorThesis',
];

const UPDATE_MATCHING_THESIS = true;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var is required');
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  console.log('Seeding new prompt definitions...\n');

  // 1. Upsert definitions for the 4 new keys
  for (const key of NEW_KEYS) {
    const catalog = AI_PROMPT_CATALOG[key];

    const [existing] = await db
      .select({ id: schema.aiPromptDefinition.id })
      .from(schema.aiPromptDefinition)
      .where(eq(schema.aiPromptDefinition.key, key))
      .limit(1);

    if (existing) {
      console.log(`  SKIP  definition exists: ${key}`);
    } else {
      await db.insert(schema.aiPromptDefinition).values({
        key,
        displayName: catalog.displayName,
        description: catalog.description,
        surface: catalog.surface,
      }).onConflictDoNothing();
      console.log(`  CREATE definition: ${key}`);
    }

    // Fetch the definition id (just inserted or pre-existing)
    const [def] = await db
      .select({ id: schema.aiPromptDefinition.id })
      .from(schema.aiPromptDefinition)
      .where(eq(schema.aiPromptDefinition.key, key))
      .limit(1);

    if (!def) {
      throw new Error(`Failed to get definition for key: ${key}`);
    }

    // 2. Insert global published revision if none exists
    const [existingRevision] = await db
      .select({ id: schema.aiPromptRevision.id })
      .from(schema.aiPromptRevision)
      .where(
        and(
          eq(schema.aiPromptRevision.definitionId, def.id),
          eq(schema.aiPromptRevision.status, 'published'),
          isNull(schema.aiPromptRevision.stage),
        ),
      )
      .limit(1);

    if (existingRevision) {
      console.log(`  SKIP  revision exists: ${key} (global)`);
    } else {
      await db.insert(schema.aiPromptRevision).values({
        definitionId: def.id,
        stage: null,
        status: 'published',
        systemPrompt: catalog.defaultSystemPrompt,
        userPrompt: catalog.defaultUserPrompt,
        notes: 'Seeded from code defaults',
        version: 1,
        publishedAt: new Date(),
      });
      console.log(`  CREATE revision: ${key} (global published)`);
    }
  }

  // 3. Update matching.thesis system prompt
  if (UPDATE_MATCHING_THESIS) {
    const thesisKey = 'matching.thesis' as AiPromptKey;
    const catalog = AI_PROMPT_CATALOG[thesisKey];

    const [def] = await db
      .select({ id: schema.aiPromptDefinition.id })
      .from(schema.aiPromptDefinition)
      .where(eq(schema.aiPromptDefinition.key, thesisKey))
      .limit(1);

    if (!def) {
      console.log(`  SKIP  matching.thesis definition not found`);
    } else {
      const result = await db
        .update(schema.aiPromptRevision)
        .set({ systemPrompt: catalog.defaultSystemPrompt, updatedAt: new Date() })
        .where(
          and(
            eq(schema.aiPromptRevision.definitionId, def.id),
            eq(schema.aiPromptRevision.status, 'published'),
            isNull(schema.aiPromptRevision.stage),
          ),
        )
        .returning({ id: schema.aiPromptRevision.id });

      if (result.length > 0) {
        console.log(`  UPDATE matching.thesis global system prompt`);
      } else {
        console.log(`  SKIP  matching.thesis: no published global revision found`);
      }
    }
  }

  await client.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
