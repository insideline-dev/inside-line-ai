import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/analysis/StatusBadge";
import { ArrowLeft, Globe, ExternalLink, MapPin, Clock, Binoculars } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import type { Startup } from "@/types/startup";
import { formatIndustry } from "@/lib/kpi-metrics";

interface StartupHeaderProps {
  startup: Startup;
  backLink: string;
  actions?: React.ReactNode;
  showStatus?: boolean;
}

export function StartupHeader({ 
  startup, 
  backLink, 
  actions,
  showStatus = true 
}: StartupHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row flex-wrap items-start gap-4">
      <Button variant="ghost" size="icon" asChild data-testid="button-back">
        <Link to={backLink}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
      </Button>
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="text-startup-name">{startup.name}</h1>
          {showStatus && <StatusBadge status={startup.status as any} data-testid="badge-status" />}
          {startup.submittedByRole === "scout" && (
            <Badge variant="secondary" className="flex items-center gap-1" data-testid="badge-scout-submitted">
              <Binoculars className="w-3 h-3" />
              Scout Referral
            </Badge>
          )}
          {startup.stage && (
            <Badge variant="outline" data-testid="badge-stage">{startup.stage.replace("_", " ")}</Badge>
          )}
          {startup.industry && (
            <Badge variant="outline" data-testid="badge-sector">{formatIndustry(startup.industry)}</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
          {startup.website && (
            <a 
              href={startup.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1"
              data-testid="link-website"
            >
              <Globe className="w-4 h-4" />
              {startup.website}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {startup.location && (
            <span className="flex items-center gap-1" data-testid="text-location">
              <MapPin className="w-4 h-4" />
              {startup.location}
            </span>
          )}
          {startup.createdAt && (
            <span className="flex items-center gap-1" data-testid="text-created-date">
              <Clock className="w-4 h-4" />
              {format(new Date(startup.createdAt), "MMM d, yyyy")}
            </span>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2" data-testid="container-header-actions">{actions}</div>}
    </div>
  );
}
