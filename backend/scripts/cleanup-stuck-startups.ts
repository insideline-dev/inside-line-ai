/**
 * Cleanup stuck startups.
 *
 * Usage:
 *   bun run scripts/cleanup-stuck-startups.ts --dry-run          # preview all stuck
 *   bun run scripts/cleanup-stuck-startups.ts <id>               # delete specific one
 *   bun run scripts/cleanup-stuck-startups.ts                    # delete all stuck
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/database/schema';

const isDryRun = process.argv.includes('--dry-run');
const targetId = process.argv.find(
  (a) => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1],
);

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema });

  if (targetId) {
    // Delete a specific startup by ID
    const [row] = await db
      .select({ id: schema.startup.id, name: schema.startup.name, status: schema.startup.status })
      .from(schema.startup)
      .where(eq(schema.startup.id, targetId))
      .limit(1);

    if (!row) {
      console.log(`No startup found with ID: ${targetId}`);
      await client.end();
      return;
    }

    console.log(`\nDeleting "${row.name}" (${row.id}) [status: ${row.status}]...`);
    await db.delete(schema.startup).where(eq(schema.startup.id, targetId));
    console.log(`  ✅ Deleted (all related data cascaded)\n`);
    await client.end();
    return;
  }

  // Find all stuck startups
  const stuckStatuses = ['submitted', 'analyzing', 'pending_review'];
  const stuck = await db
    .select({
      id: schema.startup.id,
      name: schema.startup.name,
      status: schema.startup.status,
      createdAt: schema.startup.createdAt,
    })
    .from(schema.startup)
    .where(inArray(schema.startup.status, stuckStatuses));

  if (stuck.length === 0) {
    console.log('No stuck startups found. All clear!');
    await client.end();
    return;
  }

  console.log(`\nFound ${stuck.length} stuck startup(s):\n`);
  for (const s of stuck) {
    console.log(`  ID: ${s.id}`);
    console.log(`  Name: ${s.name}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Created: ${s.createdAt}`);
    console.log('');
  }

  if (isDryRun) {
    console.log('[DRY RUN] No changes made. Pass a specific ID or remove --dry-run to delete.');
    await client.end();
    return;
  }

  for (const s of stuck) {
    console.log(`Deleting "${s.name}" (${s.id})...`);
    await db.delete(schema.startup).where(eq(schema.startup.id, s.id));
    console.log(`  ✅ Deleted (all related data cascaded)`);
  }

  console.log('\nCleanup complete!');
  await client.end();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
