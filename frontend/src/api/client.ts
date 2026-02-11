import { env } from "@/env";
import { getAccessToken, setAccessToken } from "@/lib/auth/token";

const API_BASE_URL = env.VITE_API_BASE_URL;

// Token refresh state (prevents concurrent refresh calls)
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) setAccessToken(data.accessToken);
      return true;
    }
    return false;
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
      setAccessToken(null);
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
