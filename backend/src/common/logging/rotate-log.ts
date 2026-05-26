import {
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_BACKUPS = 1;

export function rotateIfNeeded(
  filePath: string,
  maxBytes = DEFAULT_MAX_BYTES,
): boolean {
  try {
    const info = statSync(filePath);
    if (info.size < maxBytes) {
      return false;
    }
  } catch {
    return false;
  }

  for (let i = MAX_BACKUPS; i >= 1; i--) {
    const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
    const dst = `${filePath}.${i}`;
    try {
      if (i === MAX_BACKUPS) {
        try { unlinkSync(dst); } catch { /* noop */ }
      }
      renameSync(src, dst);
    } catch {
      // Source doesn't exist — skip
    }
  }

  return true;
}
