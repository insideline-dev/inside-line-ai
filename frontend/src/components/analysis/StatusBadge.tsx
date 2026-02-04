import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle, Eye, XCircle, Loader2 } from "lucide-react";
import type { StartupStatus } from "@/types";

interface StatusBadgeProps {
  status: StartupStatus;
  className?: string;
}

const statusConfig: Record<StartupStatus, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "Submitted", icon: Clock, variant: "secondary" },
  analyzing: { label: "Analyzing", icon: Loader2, variant: "outline" },
  pending_review: { label: "Pending Review", icon: Eye, variant: "outline" },
  approved: { label: "Investor Ready", icon: CheckCircle, variant: "default" },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1", className)}>
      <Icon className={cn("w-3 h-3", status === "analyzing" && "animate-spin")} />
      {config.label}
    </Badge>
  );
}
