import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserRole } from "@/types";

interface MockAuthState {
  currentRole: UserRole;
  userId: string;

  // Actions
  setRole: (role: UserRole) => void;
  setUserId: (id: string) => void;
}

const roleToUserId: Record<UserRole, string> = {
  founder: "user-founder-1",
  investor: "user-investor-1",
  admin: "user-admin-1",
  scout: "user-scout-1",
};

export const useMockAuthStore = create<MockAuthState>()(
  persist(
    (set) => ({
      currentRole: "founder",
      userId: "user-founder-1",

      setRole: (role) =>
        set({
          currentRole: role,
          userId: roleToUserId[role],
        }),

      setUserId: (id) => set({ userId: id }),
    }),
    {
      name: "mock-auth-storage",
    }
  )
);
