import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { StartupListSkeleton, DraftCardSkeleton } from "@/components/skeletons/DashboardSkeletons";
import { SearchAndFilters, useFilteredStartups, defaultFilters, type FilterState } from "@/components/SearchAndFilters";
import { Plus, FileText, Globe, ArrowRight, Clock, Sparkles, CheckCircle, Edit, Trash2 } from "lucide-react";
import { Link } from "wouter";
import type { Startup, StartupDraft } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function FounderDashboard() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const { data: startups, isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups"],
  });

  const { data: drafts, isLoading: isLoadingDrafts } = useQuery<StartupDraft[]>({
    queryKey: ["/api/drafts"],
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: number) => {
      await apiRequest("DELETE", `/api/drafts/${draftId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drafts"] });
      toast({
        title: "Draft deleted",
        description: "Your draft has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete draft. Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredStartups = useFilteredStartups(startups, filters);
  const hasDrafts = drafts && drafts.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Startups</h1>
          <p className="text-muted-foreground">
            Submit your pitch deck and website to get an institutional-grade evaluation
          </p>
        </div>
        <Button asChild data-testid="button-submit-startup">
          <Link href="/founder/submit">
            <Plus className="w-4 h-4 mr-2" />
            Submit Startup
          </Link>
        </Button>
      </div>

      {/* Drafts Section */}
      {isLoadingDrafts ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Edit className="w-5 h-5 text-chart-4" />
            Drafts
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <DraftCardSkeleton />
          </div>
        </div>
      ) : hasDrafts ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Edit className="w-5 h-5 text-chart-4" />
            Drafts
            <span className="text-sm font-normal text-muted-foreground">
              ({drafts.length} unsaved)
            </span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {drafts.map((draft) => (
              <Card 
                key={draft.id} 
                className="border-dashed border-chart-4/50 hover-elevate"
                data-testid={`card-draft-${draft.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-chart-4/10 flex items-center justify-center shrink-0">
                      <Edit className="w-5 h-5 text-chart-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="font-medium truncate">
                        {(draft.formData as any)?.name || "Untitled Draft"}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {(draft.formData as any)?.description || "No description yet"}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last saved {formatDistanceToNow(new Date(draft.lastSavedAt), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        size="sm" 
                        variant="outline"
                        asChild
                        data-testid={`button-resume-draft-${draft.id}`}
                      >
                        <Link href={`/founder/submit?draft=${draft.id}`}>
                          Resume
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteDraftMutation.mutate(draft.id)}
                        disabled={deleteDraftMutation.isPending}
                        data-testid={`button-delete-draft-${draft.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* Search and Filters */}
      {startups && startups.length > 0 && (
        <SearchAndFilters
          filters={filters}
          onFiltersChange={setFilters}
          showScoreFilter={true}
          placeholder="Search your startups..."
        />
      )}

      {/* Startups List */}
      {isLoading ? (
        <StartupListSkeleton count={2} variant="startup" />
      ) : filteredStartups.length > 0 ? (
        <div className="grid gap-6">
          {filteredStartups.map((startup) => (
            <Card key={startup.id} className="hover-elevate" data-testid={`card-startup-${startup.id}`}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center shrink-0">
                    {startup.status === "approved" ? (
                      <CheckCircle className="w-8 h-8 text-chart-2" />
                    ) : startup.status === "analyzing" ? (
                      <Sparkles className="w-8 h-8 text-chart-5 animate-pulse" />
                    ) : startup.overallScore !== null ? (
                      <CheckCircle className="w-8 h-8 text-chart-2" />
                    ) : (
                      <Clock className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold">{startup.name}</h3>
                      <StatusBadge status={startup.status as any} />
                    </div>
                    {startup.description && (
                      <p className="text-muted-foreground line-clamp-2">{startup.description}</p>
                    )}
                    {startup.status === "analyzing" && (
                      <AnalysisProgressBar startupId={startup.id} />
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {startup.website && (
                        <a 
                          href={startup.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 hover:text-foreground transition-colors"
                          data-testid={`link-website-${startup.id}`}
                        >
                          <Globe className="w-4 h-4" />
                          Website
                        </a>
                      )}
                      {startup.pitchDeckUrl && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          Deck Uploaded
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {format(new Date(startup.createdAt), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" asChild data-testid={`button-view-${startup.id}`}>
                    <Link href={`/founder/startup/${startup.id}`}>
                      View Details
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : startups && startups.length > 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No matching startups</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Try adjusting your search or filters to find what you're looking for.
            </p>
            <Button variant="outline" onClick={() => setFilters(defaultFilters)}>
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No startups yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Submit your first startup to get an AI-powered evaluation and be matched with investors.
            </p>
            <Button asChild data-testid="button-first-startup">
              <Link href="/founder/submit">
                <Plus className="w-4 h-4 mr-2" />
                Submit Your Startup
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
