import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useStartupControllerFindOne,
  useStartupControllerFindApprovedById,
  useStartupControllerGetEvaluation,
} from "@/api/generated/startups/startups";
import {
  useInvestorControllerGetEffectiveWeights,
  useInvestorControllerGetMatchDetails,
} from "@/api/generated/investor/investor";
import { useCurrentUser } from "@/lib/auth";
import { downloadMemo, downloadReport } from "@/lib/pdf/download";
import {
  StartupHeader,
  AdminSummaryTab,
  MemoTabContent,
  TeamTabContent,
  CompetitorsTabContent,
  ProductTabContent,
  MarketTabContent,
  FinancialsTabContent,
  DataRoomPanel,
} from "@/components/startup-view";
import { useToast } from "@/hooks/use-toast";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";

export const Route = createFileRoute("/_protected/investor/startup/$id")({
  component: InvestorStartupDetailPage,
});

type InvestorStartupTab =
  | "summary"
  | "memo"
  | "market"
  | "product"
  | "team"
  | "financials"
  | "competitors"
  | "data-room";

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

function InvestorStartupDetailPage() {
  const { id } = Route.useParams();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();

  const { data: ownStartupRes, isLoading: ownStartupLoading } =
    useStartupControllerFindOne(id, { query: { retry: false } });
  const {
    data: approvedStartupRes,
    isLoading: approvedStartupLoading,
    error: approvedStartupError,
  } = useStartupControllerFindApprovedById(id, { query: { retry: false } });
  const {
    data: evalRes,
    isLoading: evalLoading,
    error: evalError,
  } = useStartupControllerGetEvaluation(id);
  const { data: matchRes } = useInvestorControllerGetMatchDetails(id, {
    query: { retry: false },
  });

  const ownStartup = ownStartupRes
    ? unwrapApiResponse<Record<string, unknown>>(ownStartupRes)
    : undefined;
  const approvedStartup = approvedStartupRes
    ? unwrapApiResponse<Record<string, unknown>>(approvedStartupRes)
    : undefined;
  const startup = (ownStartup ?? approvedStartup) as (Startup & Record<string, unknown>) | undefined;
  const startupStage = typeof startup?.stage === "string" ? startup.stage : "";

  const { data: weightsRes } = useInvestorControllerGetEffectiveWeights(
    startupStage,
    { query: { enabled: Boolean(startupStage), retry: false } },
  );
  const weights = weightsRes
    ? unwrapApiResponse<ScoringWeights | null>(weightsRes)
    : null;

  const evaluationFromStartup =
    startup && typeof startup === "object" && "evaluation" in startup
      ? ((startup as { evaluation?: Evaluation }).evaluation ?? undefined)
      : undefined;
  const evaluation = evalRes
    ? unwrapApiResponse<Evaluation>(evalRes)
    : evaluationFromStartup;

  const match = matchRes
    ? unwrapApiResponse<Record<string, unknown>>(matchRes)
    : undefined;
  const thesisRationaleText =
    typeof match?.fitRationale === "string" && match.fitRationale.trim().length > 0
      ? match.fitRationale
      : typeof match?.matchReason === "string" && match.matchReason.trim().length > 0
        ? match.matchReason
        : null;

  const [activeTab, setActiveTab] = useState<InvestorStartupTab>("summary");
  const [downloading, setDownloading] = useState(false);

  const pdfData = evaluation
    ? {
        startup,
        evaluation,
        weights: (weights as Record<string, number> | null) ?? null,
        watermarkEmail: user?.email ?? null,
      }
    : null;

  const handleDownload = async (type: "memo" | "report") => {
    if (!pdfData) return;
    setDownloading(true);
    try {
      if (type === "memo") await downloadMemo(pdfData as Parameters<typeof downloadMemo>[0]);
      else await downloadReport(pdfData as Parameters<typeof downloadReport>[0]);
      toast.success(
        `${type === "memo" ? "Investment Memo" : "Analysis Report"} downloaded`,
      );
    } catch (e) {
      toast.error("Failed to generate PDF", {
        description: (e as Error).message,
      });
    } finally {
      setDownloading(false);
    }
  };

  const isLoading = ownStartupLoading || approvedStartupLoading || evalLoading;
  const error = approvedStartupError || evalError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!startup || (error && !ownStartup)) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Startup not found</h2>
        <Button asChild>
          <Link to="/investor">Back to Pipeline</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StartupHeader
        startup={startup as Startup}
        backLink="/investor"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {evaluation ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={downloading || !user?.email}>
                    <Download className="w-4 h-4 mr-2" />
                    Download
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleDownload("memo")}>
                    <FileText className="w-4 h-4 mr-2" />
                    Download Memo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDownload("report")}>
                    <BarChart2 className="w-4 h-4 mr-2" />
                    Download Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as InvestorStartupTab)}
        className="space-y-6"
      >
        <TabsList className="flex h-auto w-full flex-wrap rounded-xl bg-muted/60 p-2">
          {evaluation && (
            <>
              <TabsTrigger value="summary" className="w-full sm:w-auto">Summary</TabsTrigger>
              <TabsTrigger value="memo" className="w-full sm:w-auto">Memo</TabsTrigger>
              <TabsTrigger value="market" className="w-full sm:w-auto">Market</TabsTrigger>
              <TabsTrigger value="product" className="w-full sm:w-auto">Product</TabsTrigger>
              <TabsTrigger value="team" className="w-full sm:w-auto">Team</TabsTrigger>
              <TabsTrigger value="financials" className="w-full sm:w-auto">Financials</TabsTrigger>
              <TabsTrigger value="competitors" className="w-full sm:w-auto">Competitors</TabsTrigger>
              <TabsTrigger value="data-room" className="w-full sm:w-auto">Data Room</TabsTrigger>
            </>
          )}
        </TabsList>

        {evaluation && (
          <>
            <TabsContent value="summary" className="mt-6">
              <AdminSummaryTab
                startup={startup as Startup}
                evaluation={evaluation}
                weights={weights}
                onNavigateTab={(tab) => setActiveTab(tab as InvestorStartupTab)}
                thesisAlignment={
                  typeof match?.thesisFitScore === "number"
                    ? { thesisFitScore: match.thesisFitScore as number, rationale: thesisRationaleText ?? "" }
                    : null
                }
              />
            </TabsContent>

            <TabsContent value="memo" className="mt-6">
              <MemoTabContent
                startup={startup as Startup}
                evaluation={evaluation}
                weights={weights}
              />
            </TabsContent>

            <TabsContent value="market" className="mt-6">
              <MarketTabContent
                evaluation={evaluation}
                marketWeight={weights?.market}
                fundingStage={startup.stage}
              />
            </TabsContent>

            <TabsContent value="product" className="mt-6">
              <ProductTabContent
                startup={startup as Startup}
                evaluation={evaluation}
                productWeight={weights?.product}
              />
            </TabsContent>

            <TabsContent value="team" className="mt-6">
              <TeamTabContent
                evaluation={evaluation}
                teamMembers={(startup.teamMembers as Array<{ name: string; role: string; linkedinUrl?: string }>) || []}
                teamWeight={weights?.team}
                companyName={startup.name}
              />
            </TabsContent>

            <TabsContent value="financials" className="mt-6">
              <FinancialsTabContent
                evaluation={evaluation}
                financialsWeight={weights?.financials}
              />
            </TabsContent>

            <TabsContent value="competitors" className="mt-6">
              <CompetitorsTabContent
                evaluation={evaluation}
                companyName={startup.name}
              />
            </TabsContent>

            <TabsContent value="data-room" className="mt-6">
              <DataRoomPanel
                startupId={id}
                role="investor"
                allowUpload={false}
                allowCategoryEdit={false}
              />
            </TabsContent>

          </>
        )}

        {!evaluation && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center text-muted-foreground">
              Evaluation details are not available yet.
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}
