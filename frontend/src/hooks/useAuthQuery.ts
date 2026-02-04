import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Session, User } from "better-auth";

export const authQueryKey = ["auth"] as const;

export interface AuthQueryData {
  user: User | null;
  session: Session | null;
}

export function useAuthQuery(): UseQueryResult<AuthQueryData, Error> & {
  user: User | null;
  session: Session | null;
} {
  const query = useQuery({
    queryKey: authQueryKey,
    queryFn: async (): Promise<AuthQueryData> => {
      try {
        const sessionData = await authClient.getSession();
        return {
          user: sessionData?.data?.user ?? null,
          session: sessionData?.data?.session ?? null,
        };
      } catch (error) {
        console.error("Auth query error:", error);
        return { user: null, session: null };
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    retry: (failureCount, error: any) => {
      if (error?.status === 401 || error?.status === 403) {
        return false;
      }
      return failureCount < 2;
    },
  });

  return {
    ...query,
    user: query.data?.user ?? null,
    session: query.data?.session ?? null,
  };
}

export function useAuthQueryClient() {
  const queryClient = useQueryClient();

  return {
    invalidateAuth: () => queryClient.invalidateQueries({ queryKey: authQueryKey }),
    resetAuth: () => queryClient.resetQueries({ queryKey: authQueryKey }),
    setAuthData: (data: AuthQueryData) => queryClient.setQueryData(authQueryKey, data),
    clearAuth: () => queryClient.removeQueries({ queryKey: authQueryKey }),
  };
}

