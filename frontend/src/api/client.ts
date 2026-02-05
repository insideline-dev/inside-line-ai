import { env } from "@/env";

const API_BASE_URL = env.VITE_API_BASE_URL;

// Token refresh state (prevents concurrent refresh calls)
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  return res.ok;
}

export async function customFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const config: RequestInit = {
    ...options,
    credentials: "include", // Always send cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  let response = await fetch(`${API_BASE_URL}${url}`, config);

  // Handle 401 - attempt token refresh (skip for auth-check endpoints)
  if (response.status === 401 && url !== "/auth/me") {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshToken();
    }

    const refreshed = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (refreshed) {
      // Retry original request
      response = await fetch(`${API_BASE_URL}${url}`, config);
    } else {
      // Refresh failed - redirect to login
      window.location.href = "/login";
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
