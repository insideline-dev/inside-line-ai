import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Recursively delete files under `dir` whose mtime is older than `maxAgeMs`.
 * Silently ignores missing dirs/files. Returns count of deleted files.
 */
export async function sweepOldLogs(
  dir: string,
  maxAgeMs: number,
  now = Date.now(),
): Promise<number> {
  let deleted = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      deleted += await sweepOldLogs(full, maxAgeMs, now);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const info = await stat(full);
      if (now - info.mtimeMs > maxAgeMs) {
        await unlink(full);
        deleted += 1;
      }
    } catch {
      // ignore
    }
  }

  return deleted;
}
