import { env } from "@/env";

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const API_BASE_URL = env.VITE_API_BASE_URL;
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000; // refresh 2 min before expiry
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 min (matches backend)

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;

  // Clear existing timer
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  // Schedule proactive refresh if we have a token
  if (token) {
    const delay = ACCESS_TOKEN_TTL_MS - REFRESH_BEFORE_EXPIRY_MS; // 13 min
    refreshTimer = setTimeout(proactiveRefresh, delay);
  }
}

async function proactiveRefresh(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) setAccessToken(data.accessToken);
    } else {
      accessToken = null;
    }
  } catch {
    // Silent fail — next request will trigger reactive refresh
  }
}
