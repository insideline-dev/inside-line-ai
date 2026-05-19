/** Order-insensitive equality for dealbreaker string arrays. */
export function dealbreakerSetsEqual(
  a: string[] | null | undefined,
  b: string[] | null | undefined,
): boolean {
  const left = normalizeDealbreakerSet(a);
  const right = normalizeDealbreakerSet(b);
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

export function normalizeDealbreakerSet(
  rules: string[] | null | undefined,
): string[] {
  return [...(rules ?? [])]
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0)
    .sort();
}

export function diffDealbreakerSets(
  before: string[] | null | undefined,
  after: string[] | null | undefined,
): { added: string[]; removed: string[] } {
  const beforeNorm = new Set(normalizeDealbreakerSet(before));
  const afterNorm = new Set(normalizeDealbreakerSet(after));
  const added: string[] = [];
  const removed: string[] = [];

  for (const term of afterNorm) {
    if (!beforeNorm.has(term)) {
      const original = (after ?? []).find((r) => r.trim().toLowerCase() === term);
      added.push(original ?? term);
    }
  }
  for (const term of beforeNorm) {
    if (!afterNorm.has(term)) {
      const original = (before ?? []).find((r) => r.trim().toLowerCase() === term);
      removed.push(original ?? term);
    }
  }

  return { added, removed };
}
