import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import {
  StartupHeader,
  SummaryCard,
  MarketTabContent,
  ProductTabContent,
  TeamTabContent,
  SourcesTabContent,
  FounderRecommendationsTab,
} from "@/components/startup-view";
import {
  useStartupControllerFindOne,
  useStartupControllerGetDataRoom,
} from "@/api/generated/startups/startups";
import { EditTeamSheet } from "@/components/startup/EditTeamSheet";
import { formatIndustry, formatValuationLabel } from "@/lib/kpi-metrics";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCompactCurrency(value?: number | null): string {
  if (value == null) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function formatStage(value?: string | null): string {
  if (!value) return "N/A";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatRaiseType(value?: string | null): string {
  if (!value) return "N/A";
  return value
    .split("_")
    .map((part) => part.toUpperCase() === "SAFE" ? "SAFE" : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const Route = createFileRoute("/_protected/founder/startup/$id")({
  component: StartupDetail,
});

interface StartupWithEvaluation extends Startup {
  evaluation?: Evaluation;
}

interface DataRoomDocument {
  id: string;
  category?: string | null;
  uploadedAt?: string | null;
  assetUrl?: string | null;
  assetKey?: string | null;
  assetMimeType?: string | null;
}

const FOUNDER_STARTUP_SECTIONS = [
  { id: "summary", label: "Summary" },
  { id: "recommendations", label: "Recommendations" },
  { id: "team", label: "Team" },
  { id: "product", label: "Product" },
  { id: "market", label: "Market" },
  { id: "sources", label: "Sources" },
] as const;

function unwrapApiResponse<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data !== undefined
  ) {
    return (payload as Record<string, unknown>).data as T;
  }

  return payload as T;
}

function findScrollContainer(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY.toLowerCase();
    if (
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay"
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function StartupDetail() {
  const { id } = useParams({ from: "/_protected/founder/startup/$id" });
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("summary");

  const {
    data: startupResponse,
    isLoading,
    error,
  } = useStartupControllerFindOne(id, {
    query: {
      refetchInterval: (query) => {
        const data = unwrapApiResponse<StartupWithEvaluation | undefined>(
          query.state.data,
        );
        return data?.status === "analyzing" ? 5000 : false;
      },
    },
  });
  const startup = startupResponse
    ? unwrapApiResponse<StartupWithEvaluation>(startupResponse)
    : null;
  const { data: dataRoomResponse } = useStartupControllerGetDataRoom(id, {
    query: {
      enabled: Boolean(id),
    },
  });

  useEffect(() => {
    const firstSection = document.getElementById(
      FOUNDER_STARTUP_SECTIONS[0]?.id ?? "summary",
    );
    const scrollRoot = findScrollContainer(firstSection);
    const anchorOffset = 120;

    const resolveActiveSection = () => {
      const rootTop = scrollRoot ? scrollRoot.getBoundingClientRect().top : 0;
      let nextActive: string = FOUNDER_STARTUP_SECTIONS[0]?.id ?? "summary";

      for (const section of FOUNDER_STARTUP_SECTIONS) {
        const element = document.getElementById(section.id);
        if (!element) continue;

        const offsetFromRootTop = element.getBoundingClientRect().top - rootTop;
        if (offsetFromRootTop <= anchorOffset) {
          nextActive = section.id;
        } else {
          break;
        }
      }

      setActiveSection((prev) => (prev === nextActive ? prev : nextActive));
    };

    resolveActiveSection();
    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    scrollTarget.addEventListener("scroll", resolveActiveSection, {
      passive: true,
    });
    window.addEventListener("resize", resolveActiveSection);

    return () => {
      scrollTarget.removeEventListener("scroll", resolveActiveSection);
      window.removeEventListener("resize", resolveActiveSection);
    };
  }, [startup?.id]);

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-destructive">
          Error loading startup
        </h2>
        <p className="text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button asChild className="mt-4">
          <a href="/founder">Back to Dashboard</a>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!startup) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Startup not found</h2>
        <Button asChild className="mt-4">
          <a href="/founder">Back to Dashboard</a>
        </Button>
      </div>
    );
  }

  const evaluation = startup.evaluation;
  const rawDataRoomDocuments = dataRoomResponse
    ? unwrapApiResponse<unknown>(dataRoomResponse)
    : [];
  const dataRoomDocuments = Array.isArray(rawDataRoomDocuments)
    ? (rawDataRoomDocuments as DataRoomDocument[])
    : [];

  // Extract team members from various sources
  const teamMembers = (() => {
    const members: any[] = [];

    // First, add submitted team members
    if (startup.teamMembers && startup.teamMembers.length > 0) {
      members.push(
        ...startup.teamMembers.map((m) => ({
          name: m.name,
          role: m.role,
          linkedinUrl: m.linkedinUrl,
        })),
      );
    }

    // Then merge in evaluation data if available
    if (evaluation?.teamMemberEvaluations) {
      evaluation.teamMemberEvaluations.forEach((evalMember) => {
        const existing = members.find(
          (m) => m.name?.toLowerCase() === evalMember.name?.toLowerCase(),
        );
        if (existing) {
          Object.assign(existing, evalMember);
        } else {
          members.push(evalMember);
        }
      });
    }

    return members;
  })();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderPendingCard = (message: string) => (
    <Card className="border-dashed">
      <CardContent className="p-12 text-center">
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <StartupHeader startup={startup} backLink="/founder" showStatus={true} />

      {startup.status === "analyzing" && (
        <Card>
          <CardContent className="p-6">
            <AnalysisProgressBar startupId={startup.id} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-12">
          <section
            id="summary"
            className="scroll-mt-28 space-y-4"
            data-testid="section-summary"
          >
            {/* Startup Info Card */}
            <Card>
              <CardContent className="py-4">
                <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                  {[
                    { label: "Stage", value: formatStage(startup.stage) },
                    { label: "Sector", value: startup.sectorIndustryGroup || "N/A" },
                    { label: "Industry", value: formatIndustry(startup.sectorIndustry || startup.industry) },
                    { label: "Location", value: startup.location || "N/A" },
                    { label: "Round", value: formatCompactCurrency(startup.fundingTarget), accent: true },
                    { label: "Valuation", value: `${formatCompactCurrency(startup.valuation)} ${formatValuationLabel(startup.valuationType)}`.trim(), accent: true },
                    { label: "Raise", value: formatRaiseType(startup.raiseType) },
                    { label: "Lead", value: startup.leadInvestorName || "No" },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-[11px] text-muted-foreground">{item.label}</p>
                      <p className={cn(
                        "text-sm font-medium text-pretty",
                        "accent" in item && item.accent && "text-primary",
                      )}>
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {evaluation ? (
              <SummaryCard
                startup={startup}
                evaluation={evaluation}
                investorMemo={evaluation.investorMemo as any}
                showScores={false}
                showSectionScores={false}
                showStrengthsAndRisks={false}
              />
            ) : (
              renderPendingCard(
                startup.status === "analyzing"
                  ? "Your startup is currently being analyzed. This may take a few minutes."
                  : "Analysis has not been completed yet.",
              )
            )}
          </section>

          <section
            id="recommendations"
            className="scroll-mt-28 space-y-4"
            data-testid="section-recommendations"
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Recommendations
            </h2>
            <FounderRecommendationsTab evaluation={evaluation ?? null} />
          </section>

          <section
            id="team"
            className="scroll-mt-28 space-y-4"
            data-testid="section-team"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">Team</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditTeamOpen(true)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Team
              </Button>
            </div>
            {evaluation ? (
              <TeamTabContent
                evaluation={evaluation}
                teamMembers={teamMembers}
                teamWeight={undefined}
                companyName={startup.name}
                showStrengthsAndRisks={false}
                showDataGaps={false}
                showScores={false}
                onStrengthenExpand={() => scrollToSection("recommendations")}
              />
            ) : (
              renderPendingCard(
                "Team analysis will be available once the evaluation is complete.",
              )
            )}
          </section>

          <section
            id="product"
            className="scroll-mt-28 space-y-4"
            data-testid="section-product"
          >
            <h2 className="text-2xl font-semibold tracking-tight">Product</h2>
            {evaluation ? (
              <ProductTabContent
                startup={startup}
                evaluation={evaluation}
                productWeight={undefined}
                showDataGaps={false}
                showScores={false}
                onStrengthenExpand={() => scrollToSection("recommendations")}
              />
            ) : (
              renderPendingCard(
                "Product analysis will be available once the evaluation is complete.",
              )
            )}
          </section>

          <section
            id="market"
            className="scroll-mt-28 space-y-4"
            data-testid="section-market"
          >
            <h2 className="text-2xl font-semibold tracking-tight">Market</h2>
            {evaluation ? (
              <MarketTabContent
                evaluation={evaluation}
                showKeyFindingsAndRisks={false}
                showDataGaps={false}
                showScores={false}
                onStrengthenExpand={() => scrollToSection("recommendations")}
              />
            ) : (
              renderPendingCard(
                "Market analysis will be available once the evaluation is complete.",
              )
            )}
          </section>

          <section
            id="sources"
            className="scroll-mt-28 space-y-4"
            data-testid="section-sources"
          >
            <h2 className="text-2xl font-semibold tracking-tight">Sources</h2>
            <SourcesTabContent
              startup={startup}
              evaluation={evaluation ?? null}
              dataRoomDocuments={dataRoomDocuments}
              showAiAgents={false}
              showDatabaseRecords={false}
            />
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <Card className="border-border/70 bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/65">
              <CardContent className="p-3">
                <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Jump To
                </p>
                <nav className="space-y-1">
                  {FOUNDER_STARTUP_SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        activeSection === section.id
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {section.label}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      <EditTeamSheet
        open={editTeamOpen}
        onOpenChange={setEditTeamOpen}
        startupId={startup.id}
        teamMembers={startup.teamMembers ?? []}
      />
    </div>
  );
}
