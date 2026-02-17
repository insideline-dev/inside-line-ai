import { rename, stat, unlink } from "node:fs/promises";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_BACKUPS = 2;

/**
 * Check if a log file exceeds `maxBytes` and rotate it.
 * Keeps up to `MAX_BACKUPS` old files (.1, .2).
 * Returns `true` if rotation happened.
 */
export async function rotateIfNeeded(
  filePath: string,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<boolean> {
  try {
    const info = await stat(filePath);
    if (info.size < maxBytes) {
      return false;
    }
  } catch {
    // File doesn't exist yet — nothing to rotate
    return false;
  }

  // Shift existing backups: .2 → delete, .1 → .2, current → .1
  for (let i = MAX_BACKUPS; i >= 1; i--) {
    const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
    const dst = `${filePath}.${i}`;
    try {
      if (i === MAX_BACKUPS) {
        await unlink(dst).catch(() => {});
      }
      await rename(src, dst);
    } catch {
      // Source doesn't exist — skip
    }
  }

  return true;
}
