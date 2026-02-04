import type { User, UserRole, UserProfile } from "@/types";
import { mockUsers, getMockUserByRole, getMockUserById } from "../data/users";

// Simulated delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let currentUserId: string | null = "user-founder-1"; // Default to founder for demo

export const mockAuthService = {
  async getCurrentUser(): Promise<(User & { profile: UserProfile }) | null> {
    await delay(100);
    if (!currentUserId) return null;
    return getMockUserById(currentUserId) ?? null;
  },

  async setRole(role: UserRole): Promise<User & { profile: UserProfile }> {
    await delay(200);
    const user = getMockUserByRole(role);
    if (!user) throw new Error("User not found for role");
    currentUserId = user.id;
    return user;
  },

  async switchUser(userId: string): Promise<User & { profile: UserProfile }> {
    await delay(100);
    const user = getMockUserById(userId);
    if (!user) throw new Error("User not found");
    currentUserId = user.id;
    return user;
  },

  async logout(): Promise<void> {
    await delay(100);
    currentUserId = null;
  },

  async updateProfile(data: Partial<UserProfile>): Promise<UserProfile> {
    await delay(300);
    const user = currentUserId ? getMockUserById(currentUserId) : null;
    if (!user) throw new Error("Not authenticated");
    return { ...user.profile, ...data };
  },

  // For demo purposes - get all users
  getAllUsers(): typeof mockUsers {
    return mockUsers;
  },

  // Get current role for routing
  getCurrentRole(): UserRole | null {
    if (!currentUserId) return null;
    const user = getMockUserById(currentUserId);
    return user?.role ?? null;
  },
};
