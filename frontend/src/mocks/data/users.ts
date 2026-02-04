import type { User, UserProfile, UserRole } from "@/types";

export const mockUsers: (User & { profile: UserProfile })[] = [
  {
    id: "user-founder-1",
    email: "alex@techstartup.io",
    name: "Alex Chen",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    role: "founder",
    createdAt: "2024-01-15T10:00:00Z",
    profile: {
      id: 1,
      userId: "user-founder-1",
      role: "founder",
      companyName: "TechStartup Inc",
      title: "CEO & Co-Founder",
      linkedinUrl: "https://linkedin.com/in/alexchen",
      bio: "Serial entrepreneur with 10+ years in B2B SaaS",
      createdAt: "2024-01-15T10:00:00Z",
    },
  },
  {
    id: "user-investor-1",
    email: "sarah@venturecap.com",
    name: "Sarah Martinez",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    role: "investor",
    createdAt: "2024-01-10T10:00:00Z",
    profile: {
      id: 2,
      userId: "user-investor-1",
      role: "investor",
      companyName: "Venture Capital Partners",
      title: "General Partner",
      linkedinUrl: "https://linkedin.com/in/sarahmartinez",
      bio: "Investing in early-stage B2B SaaS and AI companies",
      createdAt: "2024-01-10T10:00:00Z",
    },
  },
  {
    id: "user-admin-1",
    email: "admin@insideline.ai",
    name: "Admin User",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
    role: "admin",
    createdAt: "2024-01-01T10:00:00Z",
    profile: {
      id: 3,
      userId: "user-admin-1",
      role: "admin",
      companyName: "Inside Line AI",
      title: "Platform Administrator",
      createdAt: "2024-01-01T10:00:00Z",
    },
  },
  {
    id: "user-scout-1",
    email: "mike@dealflow.scout",
    name: "Mike Johnson",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mike",
    role: "scout",
    createdAt: "2024-02-01T10:00:00Z",
    profile: {
      id: 4,
      userId: "user-scout-1",
      role: "scout",
      companyName: "Independent Scout",
      title: "Deal Flow Scout",
      linkedinUrl: "https://linkedin.com/in/mikejohnson",
      bio: "Former VC associate, now scouting early-stage deals",
      createdAt: "2024-02-01T10:00:00Z",
    },
  },
];

export function getMockUserByRole(role: UserRole) {
  return mockUsers.find((u) => u.role === role);
}

export function getMockUserById(id: string) {
  return mockUsers.find((u) => u.id === id);
}
