/**
 * Copy every object from one R2 bucket to another with the same object keys.
 * - Same account / same API token: server-side CopyObject (fast).
 * - Different endpoints or credentials (two accounts): streams each object
 *   (GetObject → Upload) through this machine.
 *
 * Do not commit API tokens. Use env vars or shell exports only locally.
 *
 * ── Two backends (typical: migrate old account → new account) ──────────────
 *
 *   R2_SYNC_SOURCE_ENDPOINT=https://<src_account>.r2.cloudflarestorage.com
 *   R2_SYNC_SOURCE_BUCKET=old-bucket
 *   R2_SYNC_SOURCE_ACCESS_KEY_ID=...
 *   R2_SYNC_SOURCE_SECRET_ACCESS_KEY=...
 *
 *   R2_SYNC_DEST_ENDPOINT=https://<dst_account>.r2.cloudflarestorage.com
 *   R2_SYNC_DEST_BUCKET=new-bucket
 *   R2_SYNC_DEST_ACCESS_KEY_ID=...
 *   R2_SYNC_DEST_SECRET_ACCESS_KEY=...
 *
 *   Optional: R2_SYNC_SOURCE_REGION=auto  R2_SYNC_DEST_REGION=auto
 *   R2_SYNC_FORCE_PATH_STYLE=true  — only if Cloudflare support asks (default: false)
 *
 *   Endpoint must be the account S3 API URL:
 *   https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 *   Do NOT set the endpoint to https://<bucket>.<ACCOUNT_ID>.r2.cloudflarestorage.com
 *   (bucket name belongs in *_BUCKET only).
 *
 *   cd backend && bun run storage:sync-r2
 *
 * ── One backend (same token, two buckets) ─────────────────────────────────
 *
 *   R2_SYNC_ENDPOINT=...
 *   R2_SYNC_SOURCE_BUCKET=old
 *   R2_SYNC_DEST_BUCKET=new
 *   R2_SYNC_ACCESS_KEY_ID=...
 *   R2_SYNC_SECRET_ACCESS_KEY=...
 *
 * Flags override env (see --help).
 *
 * Env files: always loads `backend/.env` (next to this script). If `process.cwd()/.env`
 * is a different file, it is loaded second with override (e.g. monorepo root overrides).
 */

import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Upload } from '@aws-sdk/lib-storage';
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const backendEnvPath = path.resolve(import.meta.dir, '../.env');
loadEnv({ path: backendEnvPath });
const cwdEnvPath = path.resolve(process.cwd(), '.env');
if (path.resolve(cwdEnvPath) !== path.resolve(backendEnvPath)) {
  loadEnv({ path: cwdEnvPath, override: true });
}

/** Trim, strip CR/LF, remove surrounding quotes from .env / shell. */
function sanitize(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  let t = s.trim().replace(/\r/g, '');
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t === '' ? undefined : t;
}

function envVar(key: string): string | undefined {
  return sanitize(process.env[key]);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  return sanitize(process.argv[i + 1]);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const DRY_RUN = hasFlag('dry-run');
const SKIP_EXISTING = hasFlag('skip-existing');
const HELP = process.argv.includes('--help') || process.argv.includes('-h');

const concurrency = Math.max(
  1,
  parseInt(arg('concurrency') ?? '12', 10) || 12,
);

function normEndpoint(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/+$/, '');
}

const sourceEndpoint = normEndpoint(
  arg('source-endpoint') ??
    envVar('R2_SYNC_SOURCE_ENDPOINT') ??
    envVar('R2_SYNC_ENDPOINT') ??
    envVar('STORAGE_ENDPOINT'),
);
const destEndpoint = normEndpoint(
  arg('dest-endpoint') ??
    envVar('R2_SYNC_DEST_ENDPOINT') ??
    envVar('R2_SYNC_ENDPOINT') ??
    envVar('STORAGE_ENDPOINT'),
);

const sourceBucket = arg('source-bucket') ?? envVar('R2_SYNC_SOURCE_BUCKET');
const destBucket = arg('dest-bucket') ?? envVar('R2_SYNC_DEST_BUCKET');

const sourceAccessKeyId =
  arg('source-access-key-id') ??
  envVar('R2_SYNC_SOURCE_ACCESS_KEY_ID') ??
  envVar('R2_SYNC_ACCESS_KEY_ID') ??
  envVar('STORAGE_ACCESS_KEY_ID');
const sourceSecretAccessKey =
  arg('source-secret-access-key') ??
  envVar('R2_SYNC_SOURCE_SECRET_ACCESS_KEY') ??
  envVar('R2_SYNC_SECRET_ACCESS_KEY') ??
  envVar('STORAGE_SECRET_ACCESS_KEY');

const destAccessKeyId =
  arg('dest-access-key-id') ??
  envVar('R2_SYNC_DEST_ACCESS_KEY_ID') ??
  envVar('R2_SYNC_ACCESS_KEY_ID') ??
  envVar('STORAGE_ACCESS_KEY_ID');
const destSecretAccessKey =
  arg('dest-secret-access-key') ??
  envVar('R2_SYNC_DEST_SECRET_ACCESS_KEY') ??
  envVar('R2_SYNC_SECRET_ACCESS_KEY') ??
  envVar('STORAGE_SECRET_ACCESS_KEY');

const sourceRegion =
  arg('source-region') ?? envVar('R2_SYNC_SOURCE_REGION') ?? 'auto';
const destRegion =
  arg('dest-region') ?? envVar('R2_SYNC_DEST_REGION') ?? 'auto';

const forcePathStyle = envVar('R2_SYNC_FORCE_PATH_STYLE') === 'true';

function copySourceValue(bucket: string, key: string): string {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function makeClient(
  endpoint: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
): S3Client {
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle,
    // Newer AWS SDK defaults can break S3-compatible providers; R2 works with:
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** R2 account endpoint host is <account_id>.r2.cloudflarestorage.com (4 labels). */
function assertR2AccountEndpoint(urlStr: string, role: string): void {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    console.error(`Invalid ${role} endpoint (not a URL): ${urlStr}`);
    process.exit(1);
  }
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('.r2.cloudflarestorage.com')) {
    return;
  }
  const labels = host.split('.');
  if (labels.length > 4) {
    console.error(
      `Invalid ${role} endpoint host "${host}".\n` +
        `Use only the account S3 API URL: https://<ACCOUNT_ID>.r2.cloudflarestorage.com\n` +
        `(R2 → bucket → Settings → S3 API). Do not put the bucket name in the endpoint hostname — set the bucket name in R2_SYNC_SOURCE_BUCKET / R2_SYNC_DEST_BUCKET instead.`,
    );
    process.exit(1);
  }
}

async function listAllKeys(client: S3Client, bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let ContinuationToken: string | undefined;

  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken,
      }),
    );
    for (const obj of out.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    ContinuationToken = out.IsTruncated
      ? out.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  return keys;
}

async function destExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let idx = 0;
  const n = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: n }, async () => {
      while (true) {
        const i = idx++;
        if (i >= items.length) break;
        await worker(items[i]);
      }
    }),
  );
}

async function main(): Promise<void> {
  if (HELP) {
    console.log(`
R2 bucket sync — copies objects with identical keys.

Env (two backends):
  R2_SYNC_SOURCE_ENDPOINT   R2_SYNC_SOURCE_BUCKET
  R2_SYNC_SOURCE_ACCESS_KEY_ID   R2_SYNC_SOURCE_SECRET_ACCESS_KEY
  R2_SYNC_DEST_ENDPOINT   R2_SYNC_DEST_BUCKET
  R2_SYNC_DEST_ACCESS_KEY_ID   R2_SYNC_DEST_SECRET_ACCESS_KEY

Env (one backend, two buckets): R2_SYNC_ENDPOINT, buckets, R2_SYNC_ACCESS_KEY_ID, R2_SYNC_SECRET_ACCESS_KEY

Flags: --source-endpoint --dest-endpoint --source-bucket --dest-bucket
       --source-access-key-id --source-secret-access-key
       --dest-access-key-id --dest-secret-access-key
       --dry-run --skip-existing --concurrency N
`);
    process.exit(0);
  }

  if (!sourceEndpoint || !destEndpoint) {
    console.error(
      'Missing endpoint(s). Set R2_SYNC_SOURCE_ENDPOINT / R2_SYNC_DEST_ENDPOINT (or R2_SYNC_ENDPOINT for both).',
    );
    process.exit(1);
  }

  if (
    !sourceBucket ||
    !destBucket ||
    !sourceAccessKeyId ||
    !sourceSecretAccessKey ||
    !destAccessKeyId ||
    !destSecretAccessKey
  ) {
    console.error(
      'Missing buckets or credentials. Need source + dest bucket names and access keys for both sides (see env names in script header).',
    );
    process.exit(1);
  }

  if (sourceBucket === destBucket && sourceEndpoint === destEndpoint) {
    console.error(
      'Source and destination bucket names must differ when using the same endpoint.',
    );
    process.exit(1);
  }

  assertR2AccountEndpoint(sourceEndpoint, 'source');
  assertR2AccountEndpoint(destEndpoint, 'destination');

  const sourceClient = makeClient(
    sourceEndpoint,
    sourceRegion,
    sourceAccessKeyId,
    sourceSecretAccessKey,
  );
  const destClient = makeClient(
    destEndpoint,
    destRegion,
    destAccessKeyId,
    destSecretAccessKey,
  );

  const sameBackend =
    sourceEndpoint === destEndpoint &&
    sourceAccessKeyId === destAccessKeyId &&
    sourceSecretAccessKey === destSecretAccessKey;

  console.error(
    sameBackend
      ? 'Mode: server-side copy (same endpoint + credentials).'
      : 'Mode: streaming copy (different endpoint or credentials).',
  );

  console.error(`Listing objects in s3://${sourceBucket} ...`);
  let keys: string[];
  try {
    keys = await listAllKeys(sourceClient, sourceBucket);
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : '';
    if (name === 'SignatureDoesNotMatch') {
      console.error(`
SignatureDoesNotMatch: wrong secret for this access key, wrong account, or endpoint/token mismatch.

Check:
  • Access key + secret are one pair from R2 → Manage R2 API Tokens (S3-style credentials). Not the Global API key.
  • STORAGE_ENDPOINT / R2_SYNC_*_ENDPOINT must be https://<ACCOUNT_ID>.r2.cloudflarestorage.com for the same Cloudflare account as that token.
  • .env values: no stray quotes; the script trims them. Regenerate the token if unsure.
  • Split accounts: R2_SYNC_SOURCE_* credentials must be for the source bucket’s account only.
  • If the token is correct, try: R2_SYNC_FORCE_PATH_STYLE=true
`);
      process.exit(1);
    }
    throw e;
  }
  console.error(`Found ${keys.length} object(s).`);

  if (keys.length === 0) {
    process.exit(0);
  }

  if (DRY_RUN) {
    for (const k of keys) console.log(k);
    console.error('Dry run: no copies performed.');
    process.exit(0);
  }

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  await runWithConcurrency(keys, concurrency, async (key) => {
    try {
      if (SKIP_EXISTING && (await destExists(destClient, destBucket, key))) {
        skipped++;
        return;
      }

      if (sameBackend) {
        await sourceClient.send(
          new CopyObjectCommand({
            Bucket: destBucket,
            Key: key,
            CopySource: copySourceValue(sourceBucket, key),
          }),
        );
      } else {
        const get = await sourceClient.send(
          new GetObjectCommand({ Bucket: sourceBucket, Key: key }),
        );
        if (!get.Body) {
          throw new Error('empty response body');
        }
        const upload = new Upload({
          client: destClient,
          params: {
            Bucket: destBucket,
            Key: key,
            Body: get.Body,
            ContentType:
              get.ContentType ?? 'application/octet-stream',
            CacheControl: get.CacheControl,
            Metadata: get.Metadata,
          },
        });
        await upload.done();
      }

      copied++;
      if ((copied + skipped) % 50 === 0) {
        console.error(`Progress: ${copied} copied, ${skipped} skipped ...`);
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`FAIL ${key}: ${msg}`);
    }
  });

  console.error(
    `Done. copied=${copied} skipped=${skipped} failed=${failed} total=${keys.length}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
