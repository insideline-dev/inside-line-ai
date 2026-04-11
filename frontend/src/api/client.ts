import { env } from "@/env";

const API_BASE_URL = env.VITE_API_BASE_URL;

// Token refresh state (prevents concurrent refresh calls from a single tab).
// Auth is cookie-only: the browser holds httpOnly access + refresh cookies, and we
// never read/write tokens from JS. This keeps access tokens out of reach of any XSS.
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function customFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const config: RequestInit = {
    ...options,
    credentials: "include",
    headers,
  };

  let response = await fetch(`${API_BASE_URL}${url}`, config);

  // Handle 429 - retry once after backoff (don't treat as auth failure)
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After")) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    response = await fetch(`${API_BASE_URL}${url}`, config);
  }

  // Handle 401 - attempt token refresh (skip for the refresh endpoint itself)
  if (response.status === 401 && url !== "/auth/refresh") {
    // Deduplicate: reuse in-flight refresh, or start a new one
    if (!refreshPromise) {
      refreshPromise = refreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;

    if (refreshed) {
      response = await fetch(`${API_BASE_URL}${url}`, config);
    } else {
      throw new Error("Session expired");
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // Handle empty responses (204, etc.)
  const text = await response.text();
  return text ? JSON.parse(text) : (null as T);
}

// Orval mutator signature exports
export type ErrorType<E> = E;
export type BodyType<B> = B;
