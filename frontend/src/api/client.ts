import { env } from "@/env";
import { queryClient } from "@/lib/query-client";
import { getAccessToken, setAccessToken } from "@/lib/auth/token";

const API_BASE_URL = env.VITE_API_BASE_URL;
const AUTH_USER_QUERY_KEY = ["auth", "user"] as const;
const REFRESH_COOLDOWN_MS = 60_000;

function clearAuthState() {
  setAccessToken(null);
  void queryClient.cancelQueries({ queryKey: AUTH_USER_QUERY_KEY });
  queryClient.setQueryData(AUTH_USER_QUERY_KEY, null);
}

async function performServerLogout() {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Best effort only.
  }
}

function redirectToLoginOnce() {
  if (typeof window === "undefined") {
    return;
  }

  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login") {
    return;
  }

  const loginUrl = new URL("/login", window.location.origin);
  if (currentPath && currentPath !== "/") {
    loginUrl.searchParams.set("redirect", currentPath);
  }

  window.location.replace(loginUrl.toString());
}

// Token refresh state (prevents concurrent refresh calls)
let refreshPromise: Promise<boolean> | null = null;
let refreshBlockedUntil = 0;

async function refreshToken(): Promise<boolean> {
  if (Date.now() < refreshBlockedUntil) {
    return false;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) setAccessToken(data.accessToken);
      refreshBlockedUntil = 0;
      return true;
    }

    if (res.status === 429) {
      const retryAfterSeconds = Number(res.headers.get("Retry-After")) || 60;
      refreshBlockedUntil = Date.now() + retryAfterSeconds * 1000;
    } else {
      refreshBlockedUntil = Date.now() + REFRESH_COOLDOWN_MS;
    }

    return false;
  } catch {
    refreshBlockedUntil = Date.now() + REFRESH_COOLDOWN_MS;
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

  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    credentials: "include", // Cookies as fallback
    headers,
  };

  let response = await fetch(`${API_BASE_URL}${url}`, config);

  if (response.status === 401 && url === "/auth/me") {
    clearAuthState();
    if (window.location.pathname !== "/login") {
      await performServerLogout();
      redirectToLoginOnce();
    }
    throw new Error("Unauthorized");
  }

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
      // Retry with new token
      const retryToken = getAccessToken();
      if (retryToken) {
        headers["Authorization"] = `Bearer ${retryToken}`;
      }
      response = await fetch(`${API_BASE_URL}${url}`, { ...config, headers });
    } else {
      clearAuthState();
      await performServerLogout();
      redirectToLoginOnce();
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
