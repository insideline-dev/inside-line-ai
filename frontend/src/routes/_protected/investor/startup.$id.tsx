import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/analysis/ScoreRing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
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
  useStartupControllerUpdate,
  getStartupControllerFindOneQueryKey,
  getStartupControllerFindApprovedByIdQueryKey,
} from "@/api/generated/startup/startup";
import {
  useInvestorControllerGetEffectiveWeights,
  useInvestorControllerGetMatchDetails,
} from "@/api/generated/investor/investor";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/auth";
import { downloadMemo, downloadReport } from "@/lib/pdf/download";
import {
  StartupHeader,
  SummaryCard,
  MemoTabContent,
  TeamTabContent,
  CompetitorsTabContent,
  ProductTabContent,
  InsightsTabContent,
} from "@/components/startup-view";
import { getDisplayOverallScore } from "@/lib/evaluation-display";

export const Route = createFileRoute("/_protected/investor/startup/$id")({
  component: InvestorStartupDetailPage,
});

type EditableTeamMember = {
  name: string;
  role: string;
  linkedinUrl: string;
};

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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: user } = useCurrentUser();

  const {
    data: ownStartupRes,
    isLoading: ownStartupLoading,
  } = useStartupControllerFindOne(id, {
    query: { retry: false },
  });
  const {
    data: approvedStartupRes,
    isLoading: approvedStartupLoading,
    error: approvedStartupError,
  } = useStartupControllerFindApprovedById(id, {
    query: { retry: false },
  });
  const { data: evalRes, isLoading: evalLoading, error: evalError } = useStartupControllerGetEvaluation(id);
  const { data: matchRes } = useInvestorControllerGetMatchDetails(id, {
    query: { retry: false },
  });

  const ownStartup = ownStartupRes
    ? unwrapApiResponse<Record<string, unknown>>(ownStartupRes)
    : undefined;
  const approvedStartup = approvedStartupRes
    ? unwrapApiResponse<Record<string, unknown>>(approvedStartupRes)
    : undefined;
  const startup = ownStartup ?? approvedStartup;
  const isOwnStartup = Boolean(ownStartup);
  const startupStage = typeof startup?.stage === "string" ? startup.stage : "";
  const { data: weightsRes } = useInvestorControllerGetEffectiveWeights(startupStage, {
    query: {
      enabled: Boolean(startupStage),
      retry: false,
    },
  });
  const weights = weightsRes
    ? unwrapApiResponse<Record<string, unknown>>(weightsRes)
    : undefined;
  const evaluationFromStartup =
    startup && typeof startup === "object" && "evaluation" in startup
      ? ((startup as { evaluation?: Record<string, unknown> }).evaluation ?? undefined)
      : undefined;
  const evaluation = evalRes
    ? unwrapApiResponse<Record<string, unknown>>(evalRes)
    : evaluationFromStartup;
  const overallScore = getDisplayOverallScore(
    (evaluation as any) ?? null,
    typeof startup?.overallScore === "number" ? startup.overallScore : null,
  );
  const match = matchRes
    ? unwrapApiResponse<Record<string, unknown>>(matchRes)
    : undefined;
  const thesisRationaleText =
    typeof match?.fitRationale === "string" && match.fitRationale.trim().length > 0
      ? match.fitRationale
      : typeof match?.matchReason === "string" && match.matchReason.trim().length > 0
        ? match.matchReason
        : null;
  const [teamMembersDraft, setTeamMembersDraft] = useState<EditableTeamMember[]>([]);

  const normalizedInitialTeamMembers = useMemo(() => {
    const source = Array.isArray(startup?.teamMembers) ? startup.teamMembers : [];
    const normalized = source.map((member) => ({
      name:
        member &&
        typeof member === "object" &&
        "name" in member &&
        typeof member.name === "string"
          ? member.name
          : "",
      role:
        member &&
        typeof member === "object" &&
        "role" in member &&
        typeof member.role === "string"
          ? member.role
          : "",
      linkedinUrl:
        member &&
        typeof member === "object" &&
        "linkedinUrl" in member &&
        typeof member.linkedinUrl === "string"
          ? member.linkedinUrl
          : "",
    }));
    return normalized.length > 0 ? normalized : [{ name: "", role: "", linkedinUrl: "" }];
  }, [startup?.teamMembers]);

  useEffect(() => {
    setTeamMembersDraft(normalizedInitialTeamMembers);
  }, [normalizedInitialTeamMembers]);

  const hasTeamChanges = useMemo(() => {
    const serialize = (members: EditableTeamMember[]) =>
      JSON.stringify(
        members.map((member) => ({
          name: member.name.trim(),
          role: member.role.trim(),
          linkedinUrl: member.linkedinUrl.trim(),
        })),
      );
    return serialize(teamMembersDraft) !== serialize(normalizedInitialTeamMembers);
  }, [teamMembersDraft, normalizedInitialTeamMembers]);

  const teamMembersForSave = useMemo(
    () =>
      teamMembersDraft
        .map((member) => ({
          name: member.name.trim(),
          role: member.role.trim(),
          linkedinUrl: member.linkedinUrl.trim(),
        }))
        .filter(
          (member) => member.name.length > 0 || member.role.length > 0 || member.linkedinUrl.length > 0,
        ),
    [teamMembersDraft],
  );

  const updateStartup = useStartupControllerUpdate({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getStartupControllerFindOneQueryKey(id) }),
          queryClient.invalidateQueries({
            queryKey: getStartupControllerFindApprovedByIdQueryKey(id),
          }),
        ]);
        toast.success("Team members updated");
      },
      onError: (error) => {
        toast.error((error as Error)?.message || "Failed to update team members");
      },
    },
  });
  const isLoading = ownStartupLoading || approvedStartupLoading || evalLoading;
  const error = approvedStartupError || evalError;
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
    if (!pdfData.watermarkEmail) {
      toast.error("Unable to generate watermark", {
        description: "User email is required for PDF watermarking.",
      });
      return;
    }

    setDownloading(true);
    try {
      if (type === "memo") await downloadMemo(pdfData as any);
      else await downloadReport(pdfData as any);
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

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
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
        startup={startup as any}
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
            {overallScore > 0 ? (
              <ScoreRing score={overallScore} size="lg" label="Overall Score" showLabel />
            ) : null}
          </div>
        }
      />

      <SummaryCard
        startup={startup as any}
        evaluation={evaluation as any}
        showScores
        showSectionScores
        showRecommendation
        weights={weights as any}
      />

      {(typeof match?.thesisFitScore === "number" || typeof thesisRationaleText === "string") && (
        <Card>
          <CardHeader>
            <CardTitle>Thesis Alignment</CardTitle>
            <CardDescription>How this startup fits your investment thesis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {typeof match?.thesisFitScore === "number" && (
              <div className="inline-flex items-center gap-3">
                <ScoreRing score={match.thesisFitScore as number} size="sm" showLabel={false} variant="secondary" />
                <span className="text-sm text-muted-foreground">Thesis fit score</span>
              </div>
            )}
            {typeof thesisRationaleText === "string" && thesisRationaleText.trim().length > 0 && (
              <p className="text-sm text-muted-foreground">{thesisRationaleText}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="memo" className="space-y-6">
        <TabsList>
          <TabsTrigger value="memo">Investment Memo</TabsTrigger>
          <TabsTrigger value="product">Product</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="memo">
          {evaluation ? (
            <MemoTabContent startup={startup as any} evaluation={evaluation as any} weights={weights as any} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center text-muted-foreground">
                Evaluation details are not available yet.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="product">
          <ProductTabContent startup={startup as any} evaluation={(evaluation as any) ?? null} />
        </TabsContent>

        <TabsContent value="team">
          {isOwnStartup && (
            <Card>
              <CardHeader>
                <CardTitle>Edit Team Members</CardTitle>
                <CardDescription>
                  Update LinkedIn URLs, add members, or remove members for this startup submission.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {teamMembersDraft.map((member, index) => (
                  <div key={`team-member-${index}`} className="rounded-md border p-3 space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`member-name-${index}`}>Name</Label>
                        <Input
                          id={`member-name-${index}`}
                          value={member.name}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTeamMembersDraft((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: value } : item,
                              ),
                            );
                          }}
                          placeholder="Jane Founder"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`member-role-${index}`}>Role</Label>
                        <Input
                          id={`member-role-${index}`}
                          value={member.role}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTeamMembersDraft((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, role: value } : item,
                              ),
                            );
                          }}
                          placeholder="CEO, CTO, etc."
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`member-linkedin-${index}`}>LinkedIn URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`member-linkedin-${index}`}
                          value={member.linkedinUrl}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTeamMembersDraft((prev) =>
                              prev.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, linkedinUrl: value } : item,
                              ),
                            );
                          }}
                          placeholder="https://linkedin.com/in/username"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            setTeamMembersDraft((prev) =>
                              prev.length > 1
                                ? prev.filter((_, itemIndex) => itemIndex !== index)
                                : [{ name: "", role: "", linkedinUrl: "" }],
                            );
                          }}
                          aria-label="Remove member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setTeamMembersDraft((prev) => [
                        ...prev,
                        { name: "", role: "", linkedinUrl: "" },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Team Member
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      updateStartup.mutate({
                        id,
                        data: {
                          teamMembers: teamMembersForSave,
                        },
                      })
                    }
                    disabled={updateStartup.isPending || !hasTeamChanges}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateStartup.isPending ? "Saving..." : "Save Team Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <TeamTabContent
            evaluation={(evaluation as any) ?? null}
            teamMembers={teamMembersForSave as any}
            companyName={startup.name as string}
          />
        </TabsContent>

        <TabsContent value="competitors">
          <CompetitorsTabContent
            evaluation={(evaluation as any) ?? null}
            companyName={startup.name as string}
          />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsTabContent evaluation={(evaluation as any) ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
