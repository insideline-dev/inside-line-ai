import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { StatusBadge } from "@/components/analysis/StatusBadge";
import { getMockStartupById } from "@/mocks/data/startups";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  MapPin,
  DollarSign,
  Calendar,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/startup/$id")({
  component: AdminReviewPage,
});

const stageLabels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  series_d: "Series D",
  series_e: "Series E",
  series_f_plus: "Series F+",
};

function formatCurrency(amount: number, currency = "USD"): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ${currency}`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K ${currency}`;
  }
  return `${amount} ${currency}`;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function AdminReviewPage() {
  const { id } = Route.useParams();
  const startup = getMockStartupById(Number(id));

  if (!startup) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Startup not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{startup.name}</h1>
            {startup.website && (
              <a
                href={startup.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={startup.status} />
            {startup.stage && (
              <Badge variant="secondary">{stageLabels[startup.stage] || startup.stage}</Badge>
            )}
            {startup.sectorIndustry && (
              <Badge variant="outline">{startup.sectorIndustry.replace(/_/g, " ")}</Badge>
            )}
          </div>
        </div>
        {startup.overallScore && <ScoreRing score={startup.overallScore} size="lg" />}
      </div>

      <div className="flex gap-2">
        <Button icon={CheckCircle} variant="default">
          Approve
        </Button>
        <Button icon={XCircle} variant="destructive">
          Reject
        </Button>
        <Button icon={RefreshCw} variant="outline">
          Re-analyze
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Company Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {startup.description && (
              <div>
                <h4 className="text-sm font-medium mb-1">Description</h4>
                <p className="text-sm text-muted-foreground">{startup.description}</p>
              </div>
            )}
            <div className="space-y-2">
              {startup.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{startup.location}</span>
                </div>
              )}
              {startup.roundSize && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Raising {formatCurrency(startup.roundSize, startup.roundCurrency)}
                  </span>
                </div>
              )}
              {startup.valuation && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Valuation: {formatCurrency(startup.valuation, startup.roundCurrency)} (
                    {startup.valuationType})
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Submitted {formatDate(startup.createdAt)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            {startup.teamMembers && startup.teamMembers.length > 0 ? (
              <div className="space-y-3">
                {startup.teamMembers.map((member, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.role}</p>
                    </div>
                    {member.linkedinUrl && (
                      <a
                        href={member.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No team members listed</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deal Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Raise Type</span>
              <span className="font-medium">{startup.raiseType?.replace(/_/g, " ")}</span>
            </div>
            {startup.leadInvestorName && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lead Investor</span>
                <span className="font-medium">{startup.leadInvestorName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lead Secured</span>
              <span className="font-medium">{startup.leadSecured ? "Yes" : "No"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              className="w-full min-h-[100px] px-3 py-2 text-sm rounded-md border border-input bg-background"
              placeholder="Add internal notes about this startup..."
            />
          </CardContent>
        </Card>
      </div>

      {startup.overallScore && (
        <Card>
          <CardHeader>
            <CardTitle>Evaluation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <ScoreRing score={startup.overallScore} size="md" />
              <div>
                <p className="text-sm text-muted-foreground">Overall Score</p>
                <p className="text-2xl font-bold">{startup.overallScore}</p>
                {startup.percentileRank && (
                  <p className="text-sm text-muted-foreground">
                    {startup.percentileRank}th percentile
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
