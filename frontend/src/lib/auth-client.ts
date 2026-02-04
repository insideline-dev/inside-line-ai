import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { env } from "@/env";
import type { Session, User } from "better-auth";

// Translate internal Docker URLs to browser-accessible URLs
const getAuthBaseUrl = () => {
  const baseUrl = env.VITE_API_BASE_URL;
  if (baseUrl.includes("://server:")) {
    const port = baseUrl.split(":").pop();
    return `http://localhost:${port}`;
  }
  return baseUrl;
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  advanced: {
    cookies: {
      sessionToken: {
        name: "better-auth.session_token",
      },
      cache: {
        enabled: true,
        maxAge: Infinity,
      },
    },
  },
});

export interface SessionData {
  user: User | null;
  session: Session | null;
}

export const sessionQueryOptions = {
  queryKey: ["session"] as const,
  queryFn: async (): Promise<SessionData | null> => {
    const { data } = await authClient.getSession();
    return data;
  },
  staleTime: Infinity,
  gcTime: 24 * 60 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: "always",
  retry: false,
} as const satisfies UseQueryOptions<SessionData | null>;

export function useSession() {
  return useQuery(sessionQueryOptions);
}

// Export common auth functions
export const { signIn, signOut } = authClient;
