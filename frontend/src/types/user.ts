export type UserRole = "founder" | "investor" | "admin" | "scout";

export interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role?: UserRole;
  createdAt: string;
  updatedAt?: string;
}

export interface UserProfile {
  id: number;
  userId: string;
  role: UserRole;
  companyName?: string;
  title?: string;
  linkedinUrl?: string;
  bio?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ScoutApplication {
  id: number;
  userId: string;
  name: string;
  email: string;
  linkedinUrl?: string;
  experience: string;
  motivation: string;
  dealflowSources?: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Notification {
  id: number;
  userId: string;
  type: "analysis_complete" | "startup_approved" | "startup_rejected" | "new_match" | "system";
  title: string;
  message: string;
  startupId?: number;
  isRead: boolean;
  createdAt: string;
}
