import { env } from "@/env";

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const API_BASE_URL = env.VITE_API_BASE_URL;
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000;
const FALLBACK_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;

  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  if (!token) {
    return;
  }

  const ttlMs = getTokenTimeToLiveMs(token) ?? FALLBACK_ACCESS_TOKEN_TTL_MS;
  const delay = Math.max(5_000, ttlMs - REFRESH_BEFORE_EXPIRY_MS);
  refreshTimer = setTimeout(proactiveRefresh, delay);
}

function getTokenTimeToLiveMs(token: string): number | null {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) {
      return null;
    }

    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);

    const payload = JSON.parse(decoded) as { exp?: number };
    if (!payload.exp) {
      return null;
    }

    return payload.exp * 1000 - Date.now();
  } catch {
    return null;
  }
}

async function proactiveRefresh(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!res.ok) {
      setAccessToken(null);
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      return;
    }

    setAccessToken(null);
  } catch {
    // Silent fail - reactive refresh in customFetch will handle next request.
  }
}
