/**
 * Register (or re-point) the AgentMail webhook for the Clara inbox.
 *
 * AgentMail is a cloud service and cannot reach localhost, so inbound email
 * events (founder replies → Clara) are delivered to a public URL that routes to
 * the backend. This script creates a webhook for the `message.received` event
 * scoped to the Clara inbox and prints the signing secret to put in
 * `backend/.env` as AGENTMAIL_WEBHOOK_SECRET (used by AgentMailSignatureGuard).
 *
 * Reads from env (backend/.env via dotenv):
 *   AGENTMAIL_API_KEY   – required
 *   CLARA_INBOX_ID      – inbox to scope the webhook to (default arg/below)
 *
 * Usage (from backend/):
 *   bun run scripts/setup-agentmail-webhook-dev.ts <publicBaseUrl> [--write-env]
 *   # e.g.
 *   bun run scripts/setup-agentmail-webhook-dev.ts https://dev-app.insideline.ai
 *   bun run scripts/setup-agentmail-webhook-dev.ts https://dev-app.insideline.ai --write-env
 *
 * --write-env upserts AGENTMAIL_WEBHOOK_SECRET into backend/.env automatically;
 * without it, the secret is only printed so you can paste it yourself.
 *
 * The script first deletes any existing webhook whose URL targets the same
 * `/integrations/agentmail/webhook` path so you don't accumulate duplicates.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AgentMailClient } from 'agentmail';

const WEBHOOK_PATH = '/integrations/agentmail/webhook';
const EVENT_TYPES = ['message.received'] as const;

const baseArg = process.argv.find((a) => a.startsWith('http'));
const writeEnv = process.argv.includes('--write-env');

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function main() {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) fail('AGENTMAIL_API_KEY is not set (check backend/.env).');

  const inboxId = process.env.CLARA_INBOX_ID;
  if (!inboxId) fail('CLARA_INBOX_ID is not set (check backend/.env).');

  if (!baseArg) fail('Pass the public base URL, e.g. https://dev-app.insideline.ai');
  const base = baseArg.replace(/\/+$/, '');
  const url = `${base}${WEBHOOK_PATH}`;

  const client = new AgentMailClient({ apiKey });

  console.log(`\nInbox:   ${inboxId}`);
  console.log(`Webhook: ${url}`);
  console.log(`Events:  ${EVENT_TYPES.join(', ')}\n`);

  // Remove ONLY an exact-URL duplicate for THIS environment. Never touch
  // webhooks for other hosts (e.g. production) — matching on path alone would
  // wipe other environments that share the same route.
  const existing = await client.webhooks.list({ limit: 100 });
  const list = (existing as { webhooks?: Array<{ webhookId: string; url: string }> }).webhooks ?? [];
  for (const wh of list) {
    if (wh.url === url) {
      console.log(`Deleting existing webhook for this URL ${wh.webhookId} (${wh.url})`);
      await client.webhooks.delete(wh.webhookId);
    }
  }

  const created = await client.webhooks.create({
    url,
    // SDK expects AgentMail.EventType[]; the string literals are the enum values.
    eventTypes: EVENT_TYPES as unknown as Parameters<typeof client.webhooks.create>[0]['eventTypes'],
    inboxIds: [inboxId],
  });

  const secret = (created as { secret?: string }).secret;
  const webhookId = (created as { webhookId?: string }).webhookId;
  if (!secret) fail('Webhook created but no secret returned — check the AgentMail dashboard.');

  console.log(`\n✅ Webhook created: ${webhookId}`);

  if (writeEnv) {
    const envPath = join(import.meta.dir, '..', '.env');
    if (!existsSync(envPath)) fail(`backend/.env not found at ${envPath}`);
    const content = readFileSync(envPath, 'utf8');
    const line = `AGENTMAIL_WEBHOOK_SECRET=${secret}`;
    const next = /^AGENTMAIL_WEBHOOK_SECRET=.*$/m.test(content)
      ? content.replace(/^AGENTMAIL_WEBHOOK_SECRET=.*$/m, line)
      : `${content.replace(/\n*$/, '\n')}${line}\n`;
    writeFileSync(envPath, next);
    console.log(`✅ Wrote AGENTMAIL_WEBHOOK_SECRET to backend/.env — restart the backend to load it.`);
  } else {
    console.log(`\nAdd this to backend/.env and restart the backend:\n\n  AGENTMAIL_WEBHOOK_SECRET=${secret}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
