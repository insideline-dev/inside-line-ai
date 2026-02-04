import { createContext, useContext, ReactNode } from "react";
import { useSession, type SessionData } from "@/lib/auth-client";

interface AuthContextValue {
  user: SessionData["user"];
  session: SessionData["session"];
  isPending: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();

  const value: AuthContextValue = {
    user: data?.user ?? null,
    session: data?.session ?? null,
    isPending,
    isAuthenticated: !!data?.user && !!data?.session,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

