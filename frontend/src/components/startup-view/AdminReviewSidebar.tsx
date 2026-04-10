import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Play,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";

interface AdminReviewSidebarProps {
  startup: Startup;
  evaluation?: Evaluation;
  adminNotes: string;
  onAdminNotesChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onDeleteSubmission: () => void;
  onMatchInvestors?: () => void;
  approveDisabled?: boolean;
  rejectDisabled?: boolean;
  deleteDisabled?: boolean;
  matchDisabled?: boolean;
  canApproveReject: boolean;
}

function formatCompactCurrency(value?: number | null): string {
  if (value == null) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function getPublicStorageOrigin(pitchDeckUrl?: string): string | null {
  if (!pitchDeckUrl) return null;
  try {
    const url = new URL(pitchDeckUrl);
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeUploadedFileHref(startup: Startup, rawPath?: string): string {
  const path = rawPath?.trim();
  if (!path) return "";

  const publicOrigin = getPublicStorageOrigin(startup.pitchDeckUrl);
  const adminStoragePathMatch = path.match(
    /(?:https?:\/\/[^/]+)?\/admin\/startup\/([^/]+\/.+)$/i,
  );
  if (adminStoragePathMatch && publicOrigin) {
    return `${publicOrigin}/${adminStoragePathMatch[1]}`;
  }

  const looksAbsolute = /^https?:\/\//i.test(path);
  if (looksAbsolute) {
    return path;
  }

  if (publicOrigin && /^[^/]+\/(?:transcripts|documents|images|files)\//i.test(path)) {
    return `${publicOrigin}/${path.replace(/^\/+/, "")}`;
  }

  return path;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function AdminReviewSidebar({
  startup,
  evaluation,
  adminNotes,
  onAdminNotesChange,
  onApprove,
  onReject,
  onDeleteSubmission,
  onMatchInvestors,
  approveDisabled,
  rejectDisabled,
  deleteDisabled,
  matchDisabled,
  canApproveReject,
}: AdminReviewSidebarProps) {
  const score = evaluation?.overallScore ?? startup.overallScore ?? 0;
  const percentile =
    startup.percentileRank != null ? `Top ${Math.round(100 - startup.percentileRank)}%` : "N/A";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Admin Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-notes">Notes</Label>
            <Textarea
              id="admin-notes"
              value={adminNotes}
              onChange={(e) => onAdminNotesChange(e.target.value)}
              placeholder="Add notes about this review..."
              className="min-h-24 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="score-override">Score Override</Label>
            <Input
              id="score-override"
              type="number"
              min={0}
              max={100}
              placeholder="Leave empty to use AI score"
              className="h-9 text-sm focus-visible:ring-1"
            />
          </div>

          {canApproveReject && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={onApprove}
                disabled={approveDisabled}
                className="h-10 text-sm font-medium"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={onReject}
                disabled={rejectDisabled}
                className="h-10 text-sm font-medium"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          )}

          {startup.status === "approved" && onMatchInvestors && (
            <Button
              onClick={onMatchInvestors}
              disabled={matchDisabled}
              className="h-10 w-full rounded-md bg-gradient-to-r from-blue-500 to-cyan-600 text-sm font-medium text-white hover:opacity-95"
            >
              <Users className="h-4 w-4 mr-2" />
              {matchDisabled ? "Matching..." : "Match Investors"}
            </Button>
          )}

          <Button
            variant="outline"
            className="h-10 w-full rounded-md border-destructive/20 text-sm font-medium text-destructive hover:text-destructive"
            onClick={onDeleteSubmission}
            disabled={deleteDisabled}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Submission
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Stats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <StatRow label="Score" value={`${Math.round(score)}/100`} />
          <StatRow label="Percentile" value={percentile} />
          <StatRow label="Round" value={formatCompactCurrency(startup.fundingTarget)} />
          <StatRow label="Valuation" value={formatCompactCurrency(startup.valuation)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Links & Docs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(() => {
            const links: { icon: ReactNode; label: string; href: string }[] = [];

            if (startup.website) {
              links.push({
                icon: <Globe className="h-4 w-4 shrink-0" />,
                label: "Website",
                href: startup.website,
              });
            }

            if (startup.pitchDeckUrl) {
              links.push({
                icon: <FileText className="h-4 w-4 shrink-0" />,
                label: "Pitch Deck",
                href: startup.pitchDeckUrl,
              });
            }

            if (startup.demoUrl) {
              links.push({
                icon: <ExternalLink className="h-4 w-4 shrink-0" />,
                label: "Demo",
                href: startup.demoUrl,
              });
            }

            if (startup.demoVideoUrl) {
              links.push({
                icon: <Play className="h-4 w-4 shrink-0" />,
                label: "Demo Video",
                href: startup.demoVideoUrl,
              });
            }

            if (startup.files?.length) {
              for (const file of startup.files) {
                const href = normalizeUploadedFileHref(startup, file.path);
                if (!href) continue;
                const categoryLabel = (file as { category?: string }).category
                  ? ` [${((file as { category?: string }).category ?? "").replace(/_/g, " ")}]`
                  : "";
                links.push({
                  icon: <Link2 className="h-4 w-4 shrink-0" />,
                  label: (file.name || "Document") + categoryLabel,
                  href,
                });
              }
            }

            if (links.length === 0) {
              return <p className="text-sm text-muted-foreground">No links available.</p>;
            }

            return links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                {link.icon}
                <span className="truncate">{link.label}</span>
              </a>
            ));
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
