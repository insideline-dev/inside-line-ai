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
  id: string;
  userId: string;
  companyName?: string;
  title?: string;
  linkedinUrl?: string;
  bio?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ScoutApplication {
  id: string;
  userId: string;
  investorId: string;
  name: string;
  email: string;
  linkedinUrl?: string;
  experience: string;
  motivation: string;
  dealflowSources?: string;
  portfolio?: string[];
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  rejectionReason?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: "info" | "success" | "warning" | "error" | "match";
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}
