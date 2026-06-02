/**
 * Audit & fix stale AgentMail inbox ids.
 *
 * Background (epic #113 blocker #1): the AgentMail SDK 404s with "Inbox not
 * found" when an inbox id that is NOT the full email address is passed as the
 * path param. Older SDK versions returned a UUID-style internal id for
 * `inbox.inboxId`, and those stale values were persisted to:
 *   - agentmail_configs.inbox_id
 *   - clara_conversations.context->>'lastInboundInboxId'
 * Current AgentMail returns the email address (e.g. clara.insideline@agentmail.to)
 * as the inbox id, so anything without an '@' is stale and breaks SDK sends.
 *
 * This script finds those rows and (with --fix) normalizes them:
 *   - agentmail_configs: set inbox_id = inbox_email when inbox_email is a valid
 *     address; otherwise flag the row for manual review (cannot guess the email).
 *   - clara_conversations: clear context.lastInboundInboxId so the send path
 *     falls back to CLARA_INBOX_ID (the correct env value).
 *
 * DB selection mirrors drizzle.config.ts: DEV_DATABASE_URL when
 * NODE_ENV=development, else DATABASE_URL.
 *
 * Usage (from backend/):
 *   bun run scripts/fix-stale-agentmail-inbox-ids.ts                 # audit only (dry run)
 *   NODE_ENV=development bun run scripts/fix-stale-agentmail-inbox-ids.ts            # audit dev DB
 *   NODE_ENV=development bun run scripts/fix-stale-agentmail-inbox-ids.ts --fix      # apply fix to dev DB
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../src/database/schema';

const APPLY = process.argv.includes('--fix');

const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^[^@\s]+@[^@\s]+$/.test(value);

function getDatabaseUrl(): string {
  const url =
    process.env.NODE_ENV === 'development' && process.env.DEV_DATABASE_URL
      ? process.env.DEV_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!url) throw new Error('No database URL found (set DATABASE_URL or DEV_DATABASE_URL)');
  return url;
}

async function main() {
  const target =
    process.env.NODE_ENV === 'development' && process.env.DEV_DATABASE_URL
      ? 'DEV_DATABASE_URL (dev)'
      : 'DATABASE_URL (default/prod)';
  console.log(`\n${APPLY ? '🛠  FIX' : '🔍 AUDIT (dry run)'} — target: ${target}\n`);

  const client = postgres(getDatabaseUrl());
  const db = drizzle(client, { schema });

  try {
    // ---- agentmail_configs ------------------------------------------------
    const configs = await db
      .select({
        id: schema.agentmailConfig.id,
        userId: schema.agentmailConfig.userId,
        inboxId: schema.agentmailConfig.inboxId,
        inboxEmail: schema.agentmailConfig.inboxEmail,
      })
      .from(schema.agentmailConfig);

    const staleConfigs = configs.filter((c) => !isEmail(c.inboxId));
    console.log(`agentmail_configs: ${configs.length} total, ${staleConfigs.length} stale (inbox_id is not an email)`);

    const fixableConfigs = staleConfigs.filter((c) => isEmail(c.inboxEmail));
    const unfixableConfigs = staleConfigs.filter((c) => !isEmail(c.inboxEmail));

    for (const c of staleConfigs) {
      const fate = isEmail(c.inboxEmail)
        ? `→ inbox_id = "${c.inboxEmail}"`
        : '→ NO valid inbox_email — needs manual review';
      console.log(`  • config ${c.id} (user ${c.userId}) inbox_id="${c.inboxId}" ${fate}`);
    }

    // ---- clara_conversations ---------------------------------------------
    const convs = await db
      .select({
        id: schema.claraConversation.id,
        threadId: schema.claraConversation.threadId,
        context: schema.claraConversation.context,
      })
      .from(schema.claraConversation);

    const staleConvs = convs.filter((conv) => {
      const ctx = (conv.context ?? {}) as Record<string, unknown>;
      const val = ctx.lastInboundInboxId;
      return val != null && !isEmail(val);
    });
    console.log(`\nclara_conversations: ${convs.length} total, ${staleConvs.length} stale (context.lastInboundInboxId is not an email)`);
    for (const conv of staleConvs) {
      const ctx = (conv.context ?? {}) as Record<string, unknown>;
      console.log(`  • conv ${conv.id} (thread ${conv.threadId}) lastInboundInboxId="${String(ctx.lastInboundInboxId)}" → cleared (falls back to CLARA_INBOX_ID)`);
    }

    // ---- apply ------------------------------------------------------------
    if (!APPLY) {
      console.log(`\nDry run only. Re-run with --fix to apply.`);
      if (unfixableConfigs.length > 0) {
        console.log(`⚠️  ${unfixableConfigs.length} config row(s) have no valid inbox_email and cannot be auto-fixed.`);
      }
      return;
    }

    let fixedConfigs = 0;
    for (const c of fixableConfigs) {
      await db
        .update(schema.agentmailConfig)
        .set({ inboxId: c.inboxEmail as string, updatedAt: new Date() })
        .where(eq(schema.agentmailConfig.id, c.id));
      fixedConfigs++;
    }

    let fixedConvs = 0;
    for (const conv of staleConvs) {
      const ctx = { ...((conv.context ?? {}) as Record<string, unknown>) };
      delete ctx.lastInboundInboxId;
      await db
        .update(schema.claraConversation)
        .set({ context: ctx, updatedAt: new Date() })
        .where(eq(schema.claraConversation.id, conv.id));
      fixedConvs++;
    }

    console.log(`\n✅ Fixed ${fixedConfigs} config row(s) and ${fixedConvs} conversation row(s).`);
    if (unfixableConfigs.length > 0) {
      console.log(`⚠️  ${unfixableConfigs.length} config row(s) skipped (no valid inbox_email) — fix these manually:`);
      for (const c of unfixableConfigs) {
        console.log(`     config ${c.id} (user ${c.userId}) inbox_id="${c.inboxId}"`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
