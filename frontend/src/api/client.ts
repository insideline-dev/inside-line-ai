import { env } from "@/env";
import { getAccessToken, setAccessToken } from "@/lib/auth/token";

const API_BASE_URL = env.VITE_API_BASE_URL;

let refreshPromise: Promise<boolean> | null = null;

type ApiError = Error & {
  status?: number;
  data?: unknown;
};

function createApiError(message: string, status?: number, data?: unknown): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.data = data;
  return err;
}

function stripQuery(url: string): string {
  return url.split("?")[0] || url;
}

function shouldAttemptRefresh(url: string): boolean {
  const path = stripQuery(url);
  return path !== "/auth/refresh" && path !== "/auth/me";
}

function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (window.location.pathname === "/login") {
    return;
  }

  const redirectPath = `${window.location.pathname}${window.location.search}`;
  sessionStorage.setItem("redirectAfterAuth", redirectPath);
  window.location.href = `/login?redirect=${encodeURIComponent(redirectPath)}`;
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      return false;
    }

    const data = await res.json().catch(() => ({}));
    if (data.accessToken) {
      setAccessToken(data.accessToken);
    }
    return true;
  } catch {
    return false;
  }
}

export async function customFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (hasBody && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    credentials: "include",
    headers,
  };

  let response = await fetch(`${API_BASE_URL}${url}`, config);

  if (response.status === 401 && shouldAttemptRefresh(url)) {
    if (!refreshPromise) {
      refreshPromise = refreshToken().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;

    if (refreshed) {
      const retryToken = getAccessToken();
      if (retryToken) {
        headers.Authorization = `Bearer ${retryToken}`;
      }
      response = await fetch(`${API_BASE_URL}${url}`, {
        ...config,
        headers,
      });
    } else {
      setAccessToken(null);
      if (token) {
        redirectToLogin();
        throw createApiError("Session expired", 401);
      }
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message =
      typeof error?.message === "string"
        ? error.message
        : `HTTP ${response.status}`;
    throw createApiError(message, response.status, error);
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export type ErrorType<E> = E;
export type BodyType<B> = B;
