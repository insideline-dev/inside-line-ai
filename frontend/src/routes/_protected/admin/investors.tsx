import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataTable } from "@/components/DataTable";
import { customFetch } from "@/api/client";
import {
  Users as UsersIcon,
  Globe,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Scale,
} from "lucide-react";

export const Route = createFileRoute("/_protected/admin/investors")({
  component: AdminInvestorsPage,
});

// ---------- Types ----------

interface InvestorListItem {
  userId: string;
  userName: string | null;
  userEmail: string;
  fundName: string | null;
  aum: string | null;
  teamSize: number | null;
  website: string | null;
  logoUrl: string | null;
  industries: string[];
  stages: string[];
  checkSizeMin: number | null;
  checkSizeMax: number | null;
  thesisSummary: string | null;
  thesisSummaryGeneratedAt: string | null;
  isActive: boolean | null;
  hasThesis: boolean;
  matchCount: number;
  createdAt: string;
}

interface InvestorDetail {
  user: { id: string; name: string | null; email: string };
  profile: {
    fundName: string;
    aum: string | null;
    teamSize: number | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
  thesis: {
    industries: string[] | null;
    stages: string[] | null;
    checkSizeMin: number | null;
    checkSizeMax: number | null;
    geographicFocus: string[] | null;
    businessModels: string[] | null;
    mustHaveFeatures: string[] | null;
    dealBreakers: string[] | null;
    thesisNarrative: string | null;
    antiPortfolio: string | null;
    thesisSummary: string | null;
    fundSize: number | null;
    notes: string | null;
    isActive: boolean;
    thesisSummaryGeneratedAt: string | null;
  } | null;
  matches: Array<{
    id: string;
    startupId: string;
    startupName: string;
    overallScore: number;
    thesisFitScore: number | null;
    fitRationale: string | null;
    status: string;
    statusChangedAt: string | null;
    isSaved: boolean;
    matchReason: string | null;
    createdAt: string;
  }>;
  scoringPreferences: Array<{
    stage: string;
    useCustomWeights: boolean;
    customWeights: Record<string, number> | null;
  }>;
}

// ---------- Helpers ----------

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCheckSize(min: number | null, max: number | null) {
  if (!min && !max) return "—";
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : `$${(n / 1_000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return `Up to ${fmt(max!)}`;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewing: "bg-yellow-100 text-yellow-800",
  engaged: "bg-green-100 text-green-800",
  closed: "bg-purple-100 text-purple-800",
  passed: "bg-gray-100 text-gray-800",
};

// ---------- Main Component ----------

function AdminInvestorsPage() {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const {
    data: investors = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "investors"],
    queryFn: () => customFetch<InvestorListItem[]>("/admin/investors"),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin", "investors", selectedUserId],
    queryFn: () =>
      customFetch<InvestorDetail>(`/admin/investors/${selectedUserId}`),
    enabled: !!selectedUserId,
  });

  const filtered = investors.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.fundName?.toLowerCase().includes(q) ||
      inv.userName?.toLowerCase().includes(q) ||
      inv.userEmail.toLowerCase().includes(q) ||
      inv.industries.some((i) => i.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Investors</h1>
        <p className="text-muted-foreground">
          Monitor investor profiles, thesis, and startup matches.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">
            All Investors ({filtered.length})
          </CardTitle>
          <Input
            placeholder="Search by fund, name, or industry..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load investors: {(error as Error).message}
            </p>
          ) : (
            <DataTable<InvestorListItem>
              data={filtered}
              columns={[
                {
                  header: "Fund / Name",
                  cell: (row) => (
                    <button
                      onClick={() => setSelectedUserId(row.userId)}
                      className="text-left hover:underline font-medium"
                    >
                      {row.fundName || row.userName || row.userEmail}
                    </button>
                  ),
                },
                {
                  header: "AUM",
                  cell: (row) => (
                    <span className="text-muted-foreground">
                      {row.aum || "—"}
                    </span>
                  ),
                },
                {
                  header: "Industries",
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.industries.slice(0, 3).map((ind) => (
                        <Badge key={ind} variant="outline" className="text-xs">
                          {ind}
                        </Badge>
                      ))}
                      {row.industries.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{row.industries.length - 3}
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Stages",
                  cell: (row) => (
                    <div className="flex flex-wrap gap-1">
                      {row.stages.slice(0, 2).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                      {row.stages.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{row.stages.length - 2}
                        </Badge>
                      )}
                    </div>
                  ),
                },
                {
                  header: "Matches",
                  numeric: true,
                  cell: (row) => (
                    <span className="font-medium">{row.matchCount}</span>
                  ),
                },
                {
                  header: "Thesis",
                  cell: (row) => (
                    <Badge
                      variant={row.hasThesis ? "default" : "outline"}
                      className="text-xs"
                    >
                      {row.hasThesis
                        ? row.isActive
                          ? "Active"
                          : "Inactive"
                        : "None"}
                    </Badge>
                  ),
                },
              ]}
              rowKey={(row) => row.userId}
              emptyState="No investors found."
            />
          )}
        </CardContent>
      </Card>

      {/* Detail Side Panel */}
      <Sheet
        open={!!selectedUserId}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-hidden p-0"
        >
          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="px-6 pt-6 pb-2">
                <SheetTitle>
                  {detail.profile?.fundName ||
                    detail.user.name ||
                    detail.user.email}
                </SheetTitle>
                <SheetDescription>{detail.user.email}</SheetDescription>
              </SheetHeader>

              <Tabs defaultValue="thesis" className="flex-1 flex flex-col">
                <TabsList className="mx-6 w-fit">
                  <TabsTrigger value="thesis">Profile & Thesis</TabsTrigger>
                  <TabsTrigger value="matches">
                    Matches ({detail.matches.length})
                  </TabsTrigger>
                  <TabsTrigger value="scoring">Scoring</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1">
                  {/* ---- Tab: Profile & Thesis ---- */}
                  <TabsContent value="thesis" className="px-6 pb-6 space-y-6">
                    {detail.profile && (
                      <Card>
                        <CardContent className="pt-6 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {detail.profile.aum && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                <span>AUM: {detail.profile.aum}</span>
                              </div>
                            )}
                            {detail.profile.teamSize && (
                              <div className="flex items-center gap-2">
                                <UsersIcon className="h-4 w-4 text-muted-foreground" />
                                <span>Team: {detail.profile.teamSize}</span>
                              </div>
                            )}
                            {detail.profile.website && (
                              <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-muted-foreground" />
                                <a
                                  href={detail.profile.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline truncate"
                                >
                                  {detail.profile.website}
                                </a>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {detail.thesis ? (
                      <>
                        {detail.thesis.thesisSummary && (
                          <div>
                            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <TrendingUp className="h-4 w-4" />
                              AI Thesis Summary
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {detail.thesis.thesisSummary}
                            </p>
                            {detail.thesis.thesisSummaryGeneratedAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Generated{" "}
                                {formatDate(
                                  detail.thesis.thesisSummaryGeneratedAt,
                                )}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="space-y-3">
                          {detail.thesis.industries &&
                            detail.thesis.industries.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Industries
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.industries.map((i) => (
                                    <Badge
                                      key={i}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {i}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.stages &&
                            detail.thesis.stages.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Stages
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.stages.map((s) => (
                                    <Badge
                                      key={s}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Check Size
                            </p>
                            <p className="text-sm">
                              {formatCheckSize(
                                detail.thesis.checkSizeMin,
                                detail.thesis.checkSizeMax,
                              )}
                            </p>
                          </div>

                          {detail.thesis.geographicFocus &&
                            detail.thesis.geographicFocus.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Geographic Focus
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.geographicFocus.map((g) => (
                                    <Badge
                                      key={g}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {g}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.dealBreakers &&
                            detail.thesis.dealBreakers.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" />
                                  Deal Breakers
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.dealBreakers.map((d) => (
                                    <Badge
                                      key={d}
                                      variant="destructive"
                                      className="text-xs"
                                    >
                                      {d}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.mustHaveFeatures &&
                            detail.thesis.mustHaveFeatures.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">
                                  Must-Have Features
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {detail.thesis.mustHaveFeatures.map((f) => (
                                    <Badge
                                      key={f}
                                      variant="default"
                                      className="text-xs"
                                    >
                                      {f}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                          {detail.thesis.thesisNarrative && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Thesis Narrative
                              </p>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {detail.thesis.thesisNarrative}
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No investment thesis configured yet.
                      </p>
                    )}
                  </TabsContent>

                  {/* ---- Tab: Matches ---- */}
                  <TabsContent value="matches" className="px-6 pb-6">
                    {detail.matches.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        No startup matches yet.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {detail.matches.map((match) => (
                          <Card key={match.id}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm">
                                  {match.startupName}
                                </span>
                                <Badge
                                  className={`text-xs ${statusColors[match.status] ?? ""}`}
                                >
                                  {match.status}
                                </Badge>
                              </div>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>
                                  Overall:{" "}
                                  <strong className="text-foreground">
                                    {match.overallScore}
                                  </strong>
                                </span>
                                {match.thesisFitScore != null && (
                                  <span>
                                    Thesis Fit:{" "}
                                    <strong className="text-foreground">
                                      {match.thesisFitScore}
                                    </strong>
                                  </span>
                                )}
                                <span>
                                  Matched: {formatDate(match.createdAt)}
                                </span>
                                {match.statusChangedAt && (
                                  <span>
                                    Status changed:{" "}
                                    {formatDate(match.statusChangedAt)}
                                  </span>
                                )}
                              </div>
                              {match.fitRationale && (
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                  {match.fitRationale}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* ---- Tab: Scoring ---- */}
                  <TabsContent value="scoring" className="px-6 pb-6">
                    {detail.scoringPreferences.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        Using default scoring weights for all stages.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {detail.scoringPreferences.map((pref) => (
                          <Card key={pref.stage}>
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm flex items-center gap-2">
                                  <Scale className="h-4 w-4" />
                                  {pref.stage}
                                </span>
                                <Badge
                                  variant={
                                    pref.useCustomWeights
                                      ? "default"
                                      : "outline"
                                  }
                                  className="text-xs"
                                >
                                  {pref.useCustomWeights
                                    ? "Custom"
                                    : "Default"}
                                </Badge>
                              </div>
                              {pref.useCustomWeights && pref.customWeights && (
                                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                                  {Object.entries(pref.customWeights).map(
                                    ([key, val]) => (
                                      <div key={key}>
                                        <span className="capitalize">
                                          {key
                                            .replace(/([A-Z])/g, " $1")
                                            .trim()}
                                        </span>
                                        :{" "}
                                        <strong className="text-foreground">
                                          {val}
                                        </strong>
                                      </div>
                                    ),
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
