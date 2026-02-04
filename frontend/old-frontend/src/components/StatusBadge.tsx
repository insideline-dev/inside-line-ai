import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle, Eye, XCircle } from "lucide-react";

type StartupStatus = "submitted" | "analyzing" | "pending_review" | "approved" | "rejected";

interface StatusBadgeProps {
  status: StartupStatus;
  className?: string;
}

const statusConfig: Record<StartupStatus, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "Submitted", icon: Clock, variant: "secondary" },
  analyzing: { label: "Analyzing", icon: Clock, variant: "outline" },
  pending_review: { label: "Pending Review", icon: Eye, variant: "outline" },
  approved: { label: "Investor Ready", icon: CheckCircle, variant: "default" },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1", className)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
