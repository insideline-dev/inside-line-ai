import type { User } from "@/lib/auth/types";

/** Label for PDF watermark: prefer display name, else email. */
export function getPrintWatermarkLabel(user: User | null | undefined): string | undefined {
  const name = user?.name?.trim();
  if (name) return name;
  const email = user?.email?.trim();
  if (email) return email;
  return undefined;
}
