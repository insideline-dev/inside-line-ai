// Shared helpers for working with the backend's `{ data, ... }` response
// envelope. The Orval-generated client returns the full typed envelope, so
// generated calls can read `.data` directly — these helpers are only needed
// for the few non-generated `customFetch` reads and for narrowing responses
// whose generated `data` type is `void`/`unknown`.
//
// TODO: ~10 components/routes still inline copies of these (e.g.
// StartupSubmitForm, useStartupRealtimeProgress, the per-role startup.$id
// routes, admin/agents, apply.$slug). Migrate them to import from here.

function hasDataField(payload: unknown): payload is { data: unknown } {
  return (
    !!payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  );
}

/**
 * Unwraps a `{ data: T }` envelope, returning the payload itself when it is
 * already the bare value. Mirrors the inlined copies it replaces.
 */
export function unwrapApiResponse<T>(payload: unknown): T {
  return hasDataField(payload) ? (payload.data as T) : (payload as T);
}

/**
 * Like {@link unwrapApiResponse} but returns `null` for a missing envelope —
 * matches the `extractResponseData<T>(): T | null` variant duplicated across
 * several routes.
 */
export function extractResponseData<T>(payload: unknown): T | null {
  return hasDataField(payload) ? (payload.data as T) : null;
}
