import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { industryGroups } from "@/data/industries";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScoreRing } from "@/components/ScoreRing";
import { StatusBadge } from "@/components/StatusBadge";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { MemoSection, FundingRoundCard } from "@/components/MemoSection";
import { ProductTabContent } from "@/components/startup-view/ProductTabContent";
import { TeamGrid } from "@/components/TeamProfile";
import { CompetitorAnalysis } from "@/components/CompetitorAnalysis";
import { TeamCompositionSummary } from "@/components/TeamCompositionSummary";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { computeWeightedScore, SectionScores } from "@/lib/score-utils";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Globe,
  FileText,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Edit,
  Save,
  Target,
  Users,
  TrendingUp,
  Building2,
  Loader2,
  ExternalLink,
  DollarSign,
  RefreshCw,
  Cpu,
  Megaphone,
  PiggyBank,
  Shield,
  Scale,
  Handshake,
  LogOut,
  ChevronRight,
  ChevronDown,
  FileBarChart,
  BarChart3,
  Swords,
  Wallet,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Code,
  MapPin,
  Clock,
  Linkedin,
  Database,
  Sparkles,
  Trash2,
  Info,
  Search
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TwoLevelIndustrySelector } from "@/components/TwoLevelIndustrySelector";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Startup, StartupEvaluation } from "@shared/schema";

interface StartupDetail extends Startup {
  evaluation?: StartupEvaluation;
}

function formatStage(stage: string | null | undefined): string {
  if (!stage) return "N/A";
  const stageMap: Record<string, string> = {
    "pre_seed": "Pre-Seed",
    "seed": "Seed",
    "series_a": "Series A",
    "series_b": "Series B",
    "series_c": "Series C",
    "series_d": "Series D",
    "series_e": "Series E",
    "series_f_plus": "Series F+",
  };
  return stageMap[stage] || stage.replace("_", " ");
}

interface ScoringWeights {
  team: number;
  market: number;
  product: number;
  traction: number;
  businessModel: number;
  gtm: number;
  financials: number;
  competitiveAdvantage: number;
  legal: number;
  dealTerms: number;
  exitPotential: number;
}

interface StageScoringWeightResponse {
  id: number;
  stage: string;
  weights: ScoringWeights;
  rationale: Record<string, string>;
  overallRationale: string | null;
}

function formatCurrency(value: number | null | undefined, currency: string = "USD"): string {
  if (!value) return "N/A";
  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  if (value >= 1000000000) return `${currencySymbol}${(value / 1000000000).toFixed(1)}B ${currency}`;
  if (value >= 1000000) return `${currencySymbol}${(value / 1000000).toFixed(1)}M ${currency}`;
  if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}K ${currency}`;
  return `${currencySymbol}${value.toLocaleString()} ${currency}`;
}

function formatRaiseType(raiseType: string | null | undefined): string {
  if (!raiseType) return "N/A";
  const typeMap: Record<string, string> = {
    safe: "SAFE",
    convertible_note: "Convertible Note",
    equity: "Equity",
    safe_equity: "SAFE + Equity",
    undecided: "Undecided"
  };
  return typeMap[raiseType] || raiseType;
}

function formatValuationType(valuationType: string | null | undefined): string {
  if (!valuationType) return "";
  return valuationType === "pre_money" ? "Pre-money" : "Post-money";
}

function formatIndustry(group: string | null | undefined, industry: string | null | undefined, sector: string | null | undefined): string {
  if (group && industry) {
    const groupLabel = group.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const industryLabel = industry.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return `${groupLabel} > ${industryLabel}`;
  }
  if (sector) return sector;
  return "N/A";
}

function formatIndustryGroup(group: string | null | undefined): string {
  if (!group) return "N/A";
  return group.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatIndustryLabel(industry: string | null | undefined): string {
  if (!industry) return "N/A";
  return industry.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getSummaryFromData(data: any): string | null {
  if (!data) return null;
  
  // Prioritize memoNarrative (AI-generated VC memo narrative)
  if (typeof data.memoNarrative === 'string' && data.memoNarrative.length > 50) {
    return data.memoNarrative;
  }
  
  // Then check narrativeSummary (the new AI-generated narrative field)
  if (typeof data.narrativeSummary === 'string' && data.narrativeSummary.length > 50) {
    return data.narrativeSummary;
  }
  
  // Check for nested summary fields (e.g., final_verdict.one_line, bottom_line.summary)
  const nestedSummaryPaths = [
    ['final_verdict', 'one_line'],
    ['bottom_line', 'summary'],
    ['overall_vc_take', 'summary'],
    ['business_model_summary', 'what_they_sell'],
    ['key_takeaways', 'one_line'],
    ['summary_thesis', 'one_liner'],
    ['overall_assessment'],
    ['gtm_summary', 'positioning'],
    ['bottom_line_vc_view', 'projections'],
    ['overall_gtm_scorecard', 'summary'],
  ];
  
  for (const path of nestedSummaryPaths) {
    let value = data;
    for (const key of path) {
      value = value?.[key];
    }
    if (typeof value === 'string' && value.length > 50) {
      return value;
    }
  }
  
  const summaryFields = ['summary', 'assessment', 'overview', 'analysis', 'description', 'detailedAnalysis', 'one_liner', 'positioning', 'what_they_sell'];
  for (const field of summaryFields) {
    if (typeof data[field] === 'string' && data[field].length > 50) {
      return data[field];
    }
  }
  
  // Look for any nested object with summary-like fields
  const summaryParts: string[] = [];
  const priorityFields = ['one_line', 'one_liner', 'summary', 'assessment', 'positioning', 'projections', 'what_they_sell', 'wedge'];
  
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'object' && data[key] && !Array.isArray(data[key])) {
      for (const pf of priorityFields) {
        if (data[key][pf] && typeof data[key][pf] === 'string' && data[key][pf].length > 30) {
          summaryParts.push(data[key][pf]);
          break;
        }
      }
    }
  }
  
  if (summaryParts.length > 0) {
    return summaryParts.slice(0, 2).join('\n\n');
  }
  
  // Last resort: look for any long string fields at root level
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'string' && data[key].length > 100 && !key.includes('_id') && !key.includes('url')) {
      return data[key];
    }
  }
  
  return null;
}

export default function AdminReview() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const [adminNotes, setAdminNotes] = useState("");
  const [scoreOverride, setScoreOverride] = useState<number | null>(null);
  
  const [editName, setEditName] = useState<string | null>(null);
  const [editWebsite, setEditWebsite] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState<string | null>(null);
  const [editStage, setEditStage] = useState<string | null>(null);
  const [editSector, setEditSector] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editRoundSize, setEditRoundSize] = useState<number | null>(null);
  const [editRoundCurrency, setEditRoundCurrency] = useState<string | null>(null);
  const [editValuation, setEditValuation] = useState<number | null>(null);
  const [editValuationType, setEditValuationType] = useState<string | null>(null);
  const [editRaiseType, setEditRaiseType] = useState<string | null>(null);
  const [editLeadSecured, setEditLeadSecured] = useState<boolean | null>(null);
  const [editLeadInvestorName, setEditLeadInvestorName] = useState<string | null>(null);
  const [editSectorIndustryGroup, setEditSectorIndustryGroup] = useState<string | null>(null);
  const [editSectorIndustry, setEditSectorIndustry] = useState<string | null>(null);
  const [editContactName, setEditContactName] = useState<string | null>(null);
  const [editContactEmail, setEditContactEmail] = useState<string | null>(null);
  const [editContactPhone, setEditContactPhone] = useState<string | null>(null);
  const [editContactPhoneCountryCode, setEditContactPhoneCountryCode] = useState<string | null>(null);
  const [editHasPreviousFunding, setEditHasPreviousFunding] = useState<boolean | null>(null);
  const [editPreviousFundingAmount, setEditPreviousFundingAmount] = useState<number | null>(null);
  const [editPreviousFundingCurrency, setEditPreviousFundingCurrency] = useState<string | null>(null);
  const [editPreviousRoundType, setEditPreviousRoundType] = useState<string | null>(null);
  const [editPreviousInvestors, setEditPreviousInvestors] = useState<string | null>(null);
  const [editValuationKnown, setEditValuationKnown] = useState<boolean | null>(null);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const { data: startup, isLoading } = useQuery<StartupDetail>({
    queryKey: ["/api/admin/startups", id],
    refetchInterval: (query) => {
      const data = query.state.data as StartupDetail | undefined;
      return data?.status === "analyzing" ? 5000 : false;
    },
  });

  // Show notification when analysis completes and refresh data
  useEffect(() => {
    if (startup?.status && prevStatusRef.current === "analyzing" && startup.status !== "analyzing") {
      const newStatus = startup.status;
      toast({
        title: "Analysis Complete",
        description: `The startup has been analyzed and moved to "${newStatus === "pending_review" ? "Pending Review" : newStatus}" status.`,
      });
      // Invalidate admin queries to update dashboard
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    }
    prevStatusRef.current = startup?.status;
  }, [startup?.status, toast]);

  // Fetch scoring weights for all stages
  const { data: allScoringWeights } = useQuery<StageScoringWeightResponse[]>({
    queryKey: ["/api/scoring-weights"],
  });

  // Get weights for this startup's stage
  const stageWeights: ScoringWeights | null = (() => {
    if (!startup?.stage || !allScoringWeights || allScoringWeights.length === 0) {
      return null;
    }
    const stageData = allScoringWeights.find(sw => sw.stage === startup.stage);
    if (stageData?.weights) {
      return stageData.weights;
    }
    return null;
  })();

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/startups/${id}/approve`, {
        adminNotes,
        scoreOverride,
      });
    },
    onSuccess: () => {
      toast({ title: "Startup approved", description: "The startup has been approved and will be matched with investors." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      navigate("/admin");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/startups/${id}/reject`, {
        adminNotes,
      });
    },
    onSuccess: () => {
      toast({ title: "Startup rejected", description: "The startup has been rejected." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      navigate("/admin");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/admin/startups/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Startup deleted", description: "The startup has been permanently deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      navigate("/admin");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const alignmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/startups/${id}/run-alignment`);
    },
    onSuccess: () => {
      toast({ title: "Alignment started", description: "Thesis alignment is running in the background. Check logs for progress." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const [selectedReEvalStage, setSelectedReEvalStage] = useState<number | null>(null);
  
  const reEvaluateMutation = useMutation({
    mutationFn: async (fromStage: number) => {
      setSelectedReEvalStage(fromStage);
      return apiRequest("POST", `/api/admin/startups/${id}/reanalyze`, { fromStage });
    },
    onSuccess: () => {
      const stageNames: Record<number, string> = {
        1: "Data Extraction",
        2: "LinkedIn Research", 
        3: "Deep Research",
        4: "Evaluation Pipeline"
      };
      toast({ 
        title: "Re-evaluation started", 
        description: `Running from Stage ${selectedReEvalStage}: ${stageNames[selectedReEvalStage || 4]}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      setSelectedReEvalStage(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSelectedReEvalStage(null);
    },
  });

  const [reanalyzingSection, setReanalyzingSection] = useState<string | null>(null);
  
  const reanalyzeSectionMutation = useMutation({
    mutationFn: async ({ section, comment }: { section: string; comment: string }) => {
      setReanalyzingSection(section);
      return apiRequest("POST", `/api/admin/startups/${id}/reanalyze/${section}`, { adminComment: comment });
    },
    onSuccess: () => {
      toast({ title: "Section updated", description: "The AI has re-analyzed this section with your feedback." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups", id] });
      setReanalyzingSection(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setReanalyzingSection(null);
    },
  });

  const handleSectionReanalyze = async (sectionKey: string, comment: string) => {
    await reanalyzeSectionMutation.mutateAsync({ section: sectionKey, comment });
  };

  const updateStartupMutation = useMutation({
    mutationFn: async (updates: Partial<Startup>) => {
      return apiRequest("PATCH", `/api/admin/startups/${id}`, updates);
    },
    onSuccess: () => {
      toast({ title: "Startup updated", description: "The startup details have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
      setEditName(null);
      setEditWebsite(null);
      setEditDescription(null);
      setEditStage(null);
      setEditSector(null);
      setEditLocation(null);
      setEditStatus(null);
      setEditRoundSize(null);
      setEditRoundCurrency(null);
      setEditValuation(null);
      setEditValuationType(null);
      setEditRaiseType(null);
      setEditLeadSecured(null);
      setEditLeadInvestorName(null);
      setEditSectorIndustryGroup(null);
      setEditSectorIndustry(null);
      setEditContactName(null);
      setEditContactEmail(null);
      setEditContactPhone(null);
      setEditContactPhoneCountryCode(null);
      setEditHasPreviousFunding(null);
      setEditPreviousFundingAmount(null);
      setEditPreviousFundingCurrency(null);
      setEditPreviousRoundType(null);
      setEditPreviousInvestors(null);
      setEditValuationKnown(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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
          <Link href="/admin">Back to Admin Dashboard</Link>
        </Button>
      </div>
    );
  }

  const evaluation = startup.evaluation;
  const investorMemo = evaluation?.investorMemo as any;
  const founderReport = evaluation?.founderReport as any;

  // Compute the overall score dynamically using the current stage weights
  const computedOverallScore = (() => {
    if (!evaluation || !stageWeights) {
      return startup.overallScore || 0;
    }
    const sectionScores: Partial<SectionScores> = {
      team: evaluation.teamScore ?? undefined,
      market: evaluation.marketScore ?? undefined,
      product: evaluation.productScore ?? undefined,
      traction: evaluation.tractionScore ?? undefined,
      businessModel: evaluation.businessModelScore ?? undefined,
      gtm: evaluation.gtmScore ?? undefined,
      financials: evaluation.financialsScore ?? undefined,
      competitiveAdvantage: evaluation.competitiveAdvantageScore ?? undefined,
      legal: evaluation.legalScore ?? undefined,
      dealTerms: evaluation.dealTermsScore ?? undefined,
      exitPotential: evaluation.exitPotentialScore ?? undefined,
    };
    return computeWeightedScore(sectionScores, stageWeights);
  })();

  // Collect team members from multiple sources
  const getTeamMembers = () => {
    const teamData = evaluation?.teamData as any;
    const teamEvals = evaluation?.teamMemberEvaluations as any[] || [];
    const submittedMembers = startup.teamMembers as any[] || [];
    // TeamAgent returns enrichedMembers, fallback to founders for legacy data
    const extractedFounders = teamData?.enrichedMembers || teamData?.founders || [];
    // Team Agent's detailed evaluation (has relevantExperience, background, fmfScore)
    // Check new format (members directly) and legacy format (teamEvaluation.members)
    const teamEvalMembers = teamData?.members || teamData?.teamEvaluation?.members || [];
    // Also check cached comprehensive research data for legacy bio/imageUrl fields
    const researchTeamMembers = (evaluation as any)?.comprehensiveResearchData?.extractedData?.teamMembers || [];
    // Cached LinkedIn profiles from API (keyed by lowercase URL)
    const cachedLinkedinProfiles = (startup as any)?.linkedinProfiles || {};
    
    // Create a map to dedupe by name
    const memberMap = new Map<string, any>();
    
    // First add all team members from teamMemberEvaluations (most complete source)
    for (const evalMember of teamEvals) {
      const key = evalMember.name?.toLowerCase() || '';
      if (key) memberMap.set(key, { ...evalMember, source: 'evaluation' });
    }
    
    // Then merge in research team members (has bio, imageUrl from LinkedIn enrichment)
    for (const researchMember of researchTeamMembers) {
      const key = researchMember.name?.toLowerCase() || '';
      if (key) {
        const existing = memberMap.get(key);
        memberMap.set(key, { 
          ...researchMember, 
          ...existing, // Keep existing fields, but add bio/imageUrl from research
          bio: researchMember.bio || existing?.bio,
          imageUrl: researchMember.imageUrl || existing?.imageUrl,
          source: existing?.source || 'research' 
        });
      }
    }
    
    // Then add submitted members (may have additional details)
    for (const member of submittedMembers) {
      const key = member.name?.toLowerCase() || '';
      if (key) {
        const existing = memberMap.get(key);
        memberMap.set(key, { ...existing, ...member, source: 'submitted' });
      }
    }
    
    // Then add/merge extracted founders from AI
    for (const founder of extractedFounders) {
      const key = founder.name?.toLowerCase() || '';
      if (key) {
        const existing = memberMap.get(key);
        memberMap.set(key, { 
          ...existing, 
          ...founder, 
          role: founder.role || existing?.role || 'Founder',
          source: 'extracted' 
        });
      }
    }
    
    // Now enrich each member with LinkedIn profile data
    return Array.from(memberMap.values()).map((member: any) => {
      const memberEval = teamEvals?.find((e: any) => 
        e.name?.toLowerCase() === member.name?.toLowerCase()
      );
      const founderData = extractedFounders?.find((f: any) => 
        f.name?.toLowerCase() === member.name?.toLowerCase()
      );
      // Team Agent's detailed evaluation (has good relevantExperience)
      const teamEvalData = teamEvalMembers?.find((f: any) => 
        f.name?.toLowerCase() === member.name?.toLowerCase()
      );
      // Research bio from comprehensive research (LinkedIn profile summary)
      const researchMember = researchTeamMembers?.find((r: any) =>
        r.name?.toLowerCase() === member.name?.toLowerCase()
      );
      
      // Get cached LinkedIn profile by name (API returns profiles keyed by lowercase name)
      const memberNameLower = member.name?.toLowerCase() || '';
      const cachedProfile = memberNameLower ? cachedLinkedinProfiles[memberNameLower] : null;
      
      const linkedinData = cachedProfile || memberEval?.linkedinData || memberEval || {};
      
      return {
        name: member.name || "Unknown",
        role: memberEval?.role || member.role || founderData?.role || "Team Member",
        linkedinUrl: memberEval?.linkedinUrl || member.linkedinUrl || founderData?.linkedinUrl,
        headline: linkedinData.headline || linkedinData.currentPosition || founderData?.currentPosition || member.headline || "",
        summary: linkedinData.summary || member.bio || memberEval?.bio || founderData?.background || memberEval?.linkedinAnalysis?.background || "",
        profilePictureUrl: linkedinData.profilePictureUrl || member.imageUrl || memberEval?.imageUrl || founderData?.profilePictureUrl || "",
        location: linkedinData.location || founderData?.location || "",
        experience: (linkedinData.experienceDetails && linkedinData.experienceDetails.length > 0) 
          ? linkedinData.experienceDetails 
          : (linkedinData.positions && linkedinData.positions.length > 0) 
            ? linkedinData.positions
            : (linkedinData.experience && linkedinData.experience.length > 0) 
              ? linkedinData.experience 
              : (memberEval?.previousCompanies && memberEval.previousCompanies.length > 0)
                ? memberEval.previousCompanies.map((c: string) => ({ title: "Role", company: c }))
                : (founderData?.previousCompanies && founderData.previousCompanies.length > 0)
                  ? founderData.previousCompanies.map((c: string) => ({ title: "Role", company: c }))
                  : [],
        education: linkedinData.educationDetails || linkedinData.education || memberEval?.education || founderData?.education || [],
        skills: linkedinData.skills || founderData?.skills || [],
        fmfScore: teamEvalData?.fmfScore || memberEval?.fmfScore || founderData?.founderMarketFit || memberEval?.linkedinAnalysis?.founderMarketFit,
        relevantExperience: teamEvalData?.relevantExperience || "",
        background: teamEvalData?.background || "",
      };
    });
  };
  
  const teamMembers = getTeamMembers();

  const hasEditChanges = editName !== null || editWebsite !== null || editDescription !== null || 
    editStage !== null || editSector !== null || editLocation !== null || editStatus !== null ||
    editRoundSize !== null || editRoundCurrency !== null || editValuation !== null ||
    editValuationType !== null || editRaiseType !== null || editLeadSecured !== null ||
    editLeadInvestorName !== null || editSectorIndustryGroup !== null || editSectorIndustry !== null ||
    editContactName !== null || editContactEmail !== null || editContactPhone !== null ||
    editContactPhoneCountryCode !== null || editHasPreviousFunding !== null ||
    editPreviousFundingAmount !== null || editPreviousFundingCurrency !== null ||
    editPreviousRoundType !== null || editPreviousInvestors !== null ||
    editValuationKnown !== null;

  const handleSaveChanges = () => {
    const updates: Partial<Startup> = {};
    if (editName !== null) updates.name = editName;
    if (editWebsite !== null) updates.website = editWebsite;
    if (editDescription !== null) updates.description = editDescription;
    if (editStage !== null) updates.stage = editStage as any;
    if (editSector !== null) updates.sector = editSector;
    if (editLocation !== null) updates.location = editLocation;
    if (editStatus !== null) updates.status = editStatus as any;
    if (editRoundSize !== null) updates.roundSize = editRoundSize;
    if (editRoundCurrency !== null) updates.roundCurrency = editRoundCurrency;
    if (editValuation !== null) updates.valuation = editValuation;
    if (editValuationType !== null) updates.valuationType = editValuationType as any;
    if (editRaiseType !== null) updates.raiseType = editRaiseType as any;
    if (editLeadSecured !== null) updates.leadSecured = editLeadSecured;
    if (editLeadInvestorName !== null) updates.leadInvestorName = editLeadInvestorName;
    if (editSectorIndustryGroup !== null) updates.sectorIndustryGroup = editSectorIndustryGroup;
    if (editSectorIndustry !== null) updates.sectorIndustry = editSectorIndustry;
    if (editContactName !== null) updates.contactName = editContactName;
    if (editContactEmail !== null) updates.contactEmail = editContactEmail;
    if (editContactPhone !== null) updates.contactPhone = editContactPhone;
    if (editContactPhoneCountryCode !== null) updates.contactPhoneCountryCode = editContactPhoneCountryCode;
    if (editHasPreviousFunding !== null) updates.hasPreviousFunding = editHasPreviousFunding;
    if (editPreviousFundingAmount !== null) updates.previousFundingAmount = editPreviousFundingAmount;
    if (editPreviousFundingCurrency !== null) updates.previousFundingCurrency = editPreviousFundingCurrency;
    if (editPreviousRoundType !== null) updates.previousRoundType = editPreviousRoundType;
    if (editPreviousInvestors !== null) updates.previousInvestors = editPreviousInvestors;
    if (editValuationKnown !== null) updates.valuationKnown = editValuationKnown;
    
    if (Object.keys(updates).length > 0) {
      updateStartupMutation.mutate(updates);
    }
  };

  const handleDownloadPDF = async () => {
    if (!startup || !evaluation) return;
    
    setIsDownloadingPDF(true);
    try {
      const response = await fetch(`/api/startups/${startup.id}/memo.pdf`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${startup.name.replace(/[^a-zA-Z0-9]/g, '_')}_Investment_Memo.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "PDF Downloaded", description: "Investment memo has been downloaded." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!startup || !evaluation) return;
    
    setIsDownloadingReport(true);
    try {
      const response = await fetch(`/api/startups/${startup.id}/report.pdf`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate Report PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${startup.name.replace(/[^a-zA-Z0-9]/g, '_')}_Analysis_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "PDF Downloaded", description: "Analysis report has been downloaded." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate Report PDF", variant: "destructive" });
    } finally {
      setIsDownloadingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{startup.name}</h1>
            {startup.sector && <Badge variant="secondary">{startup.sector}</Badge>}
            {evaluation && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={isDownloadingPDF || isDownloadingReport}
                    data-testid="button-download-dropdown"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isDownloadingPDF || isDownloadingReport ? "Generating..." : "Download"}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem 
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPDF}
                    data-testid="menu-item-download-memo"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Download Memo
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={handleDownloadReport}
                    disabled={isDownloadingReport}
                    data-testid="menu-item-download-report"
                  >
                    <FileBarChart className="w-4 h-4 mr-2" />
                    Download Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
            {startup.website && (
              <a 
                href={startup.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <Globe className="w-4 h-4" />
                {startup.website}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {format(new Date(startup.createdAt), "MMM d, yyyy")}
            </span>
            <StatusBadge status={startup.status as any} />
          </div>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={reEvaluateMutation.isPending}
                data-testid="button-re-evaluate"
              >
                {reEvaluateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Re-evaluate
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Re-evaluate from stage</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => reEvaluateMutation.mutate(1)}
                data-testid="reeval-stage-1"
              >
                <div className="flex flex-col">
                  <span className="font-medium">Stage 1: Data Extraction</span>
                  <span className="text-xs text-muted-foreground">Re-parse documents and extract data</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => reEvaluateMutation.mutate(2)}
                data-testid="reeval-stage-2"
              >
                <div className="flex flex-col">
                  <span className="font-medium">Stage 2: LinkedIn Research</span>
                  <span className="text-xs text-muted-foreground">Re-fetch team LinkedIn profiles</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => reEvaluateMutation.mutate(3)}
                data-testid="reeval-stage-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">Stage 3: Deep Research</span>
                  <span className="text-xs text-muted-foreground">Re-run Team, Market, Product research agents</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => reEvaluateMutation.mutate(4)}
                data-testid="reeval-stage-4"
              >
                <div className="flex flex-col">
                  <span className="font-medium">Stage 4: Evaluation Pipeline</span>
                  <span className="text-xs text-muted-foreground">Re-run 11 section agents + synthesis</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Analysis Progress Bar - shown when status is analyzing */}
      {startup.status === "analyzing" && stageWeights && (
        <Card className="mb-6">
          <CardContent className="p-6">
            <AnalysisProgress 
              startupId={startup.id} 
              isAnalyzing={true} 
              weights={stageWeights} 
            />
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="summary" className="space-y-6">
            <TabsList className="w-full grid grid-cols-8">
              <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
              <TabsTrigger value="memo" data-testid="tab-memo">Memo</TabsTrigger>
              <TabsTrigger value="product" data-testid="tab-product">Product</TabsTrigger>
              <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
              <TabsTrigger value="competitors" data-testid="tab-competitors">Competitors</TabsTrigger>
              <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
              <TabsTrigger value="edit" data-testid="tab-edit">Edit</TabsTrigger>
              <TabsTrigger value="raw" data-testid="tab-raw">Raw</TabsTrigger>
            </TabsList>

            {/* SUMMARY TAB */}
            <TabsContent value="summary" className="space-y-6">
              {/* Score + Deal Info */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex flex-col items-center text-center">
                      <ScoreRing score={computedOverallScore} size="lg" />
                      {startup.percentileRank && (
                        <Badge variant="outline" className="mt-2">
                          Top {100 - startup.percentileRank}%
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 min-w-0">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Stage</p>
                        <p className="font-medium text-xs break-words">{formatStage(startup.stage)}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Industry Group</p>
                        <p className="font-medium text-xs break-words">{formatIndustryGroup(startup.sectorIndustryGroup) || startup.sector || "N/A"}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Industry</p>
                        <p className="font-medium text-xs break-words">{formatIndustryLabel(startup.sectorIndustry)}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Location</p>
                        <p className="font-medium text-xs break-words">{startup.location || "N/A"}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Round Size</p>
                        <p className="font-medium text-xs text-primary break-words">{formatCurrency(startup.roundSize, startup.roundCurrency || "USD")}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Valuation {startup.valuationKnown !== false && formatValuationType(startup.valuationType) && `(${formatValuationType(startup.valuationType)})`}</p>
                        <p className="font-medium text-xs text-primary break-words">
                          {startup.valuationKnown === false 
                            ? "Not yet determined" 
                            : formatCurrency(startup.valuation, startup.roundCurrency || "USD")}
                        </p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Raise Type</p>
                        <p className="font-medium text-xs break-words">{formatRaiseType(startup.raiseType)}</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Lead Investor</p>
                        <p className="font-medium text-xs break-words">
                          {startup.leadSecured 
                            ? `Yes${startup.leadInvestorName ? ` (${startup.leadInvestorName})` : ""}`
                            : "No"
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Previous Funding Section */}
              {startup.hasPreviousFunding && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-primary" />
                      Previous Funding
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 min-w-0">
                      {startup.previousFundingAmount && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Amount Raised</p>
                          <p className="font-medium text-xs break-words">{formatCurrency(startup.previousFundingAmount, startup.previousFundingCurrency || "USD")}</p>
                        </div>
                      )}
                      {startup.previousRoundType && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Round Type</p>
                          <p className="font-medium text-xs break-words">{startup.previousRoundType}</p>
                        </div>
                      )}
                      {startup.previousInvestors && (
                        <div className="p-3 bg-muted/50 rounded-lg col-span-2">
                          <p className="text-xs text-muted-foreground mb-1">Previous Investors</p>
                          <p className="font-medium text-xs break-words">{startup.previousInvestors}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Deal Snapshot - 2 Min Pitch (Top 5 compelling points) */}
              {(investorMemo?.dealHighlights?.length > 0 || (evaluation?.keyStrengths as string[] || []).length > 0) && (
                <Card className="border-2 border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-primary" />
                      Deal Snapshot
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Top highlights for a 2-minute pitch</p>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(investorMemo?.dealHighlights || evaluation?.keyStrengths as string[] || []).slice(0, 5).map((highlight: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-medium flex items-center justify-center shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Strengths & Risks */}
              {evaluation && (
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="bg-chart-2/5 border-chart-2/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-chart-2">
                        <CheckCircle className="w-5 h-5" />
                        Key Strengths
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {(evaluation.keyStrengths as string[] || []).map((strength, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card className="bg-chart-4/5 border-chart-4/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-chart-4">
                        <AlertTriangle className="w-5 h-5" />
                        Key Risks
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {(evaluation.keyRisks as string[] || []).map((risk, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <ChevronRight className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Section Scores */}
              {evaluation && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      Section Scores
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!stageWeights ? (
                      <div className="text-sm text-muted-foreground">Loading weights...</div>
                    ) : (
                      <div className="space-y-3">
                        {[
                          { name: "Team", score: evaluation.teamScore, weight: `${stageWeights.team}%` },
                          { name: "Market", score: evaluation.marketScore, weight: `${stageWeights.market}%` },
                          { name: "Product", score: evaluation.productScore, weight: `${stageWeights.product}%` },
                          { name: "Traction", score: evaluation.tractionScore, weight: `${stageWeights.traction}%` },
                          { name: "Business Model", score: evaluation.businessModelScore, weight: `${stageWeights.businessModel}%` },
                          { name: "Go-to-Market", score: evaluation.gtmScore, weight: `${stageWeights.gtm}%` },
                          { name: "Competitive Advantage", score: evaluation.competitiveAdvantageScore, weight: `${stageWeights.competitiveAdvantage}%` },
                          { name: "Financials", score: evaluation.financialsScore, weight: `${stageWeights.financials}%` },
                          { name: "Legal", score: evaluation.legalScore, weight: `${stageWeights.legal}%` },
                          { name: "Deal Terms", score: evaluation.dealTermsScore, weight: `${stageWeights.dealTerms}%` },
                          { name: "Exit Potential", score: evaluation.exitPotentialScore, weight: `${stageWeights.exitPotential}%` },
                        ].map((section) => (
                          <div key={section.name} className="flex items-center gap-3">
                            <span className="text-sm w-40 shrink-0">{section.name}</span>
                            <span className="text-xs text-muted-foreground w-12">{section.weight}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  (section.score || 0) >= 80 ? "bg-chart-2" :
                                  (section.score || 0) >= 60 ? "bg-chart-3" :
                                  (section.score || 0) >= 40 ? "bg-chart-4" :
                                  "bg-chart-5"
                                }`}
                                style={{ width: `${section.score || 0}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-12 text-right">{section.score || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </TabsContent>

            {/* PRODUCT TAB */}
            <TabsContent value="product">
              <ProductTabContent startup={startup} evaluation={evaluation || null} productWeight={stageWeights?.product} />
            </TabsContent>

            {/* MEMO TAB */}
            <TabsContent value="memo">
              {evaluation ? (
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg">Investment Memo</CardTitle>
                    <CardDescription>
                      Comprehensive analysis across 11 evaluation dimensions
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">

                  {/* Executive Summary */}
                  <MemoSection
                    title="Executive Summary"
                    icon={FileText}
                    summary={(evaluation as any)?.executiveSummary || investorMemo?.summary || founderReport?.summary || "This startup is currently under evaluation. The AI analysis system has processed the available information to generate a comprehensive assessment."}
                    defaultExpanded={true}
                    details={
                      <div className="space-y-4">
                        {startup.description && (
                          <div>
                            <h4 className="font-medium mb-2">Company Overview</h4>
                            <p>{startup.description}</p>
                          </div>
                        )}
                        {investorMemo?.rationale && (
                          <div>
                            <h4 className="font-medium mb-2">Investment Rationale</h4>
                            <p>{investorMemo.rationale}</p>
                          </div>
                        )}
                      </div>
                    }
                  />

                  {/* Team */}
                  <MemoSection
                    title="Team"
                    icon={Users}
                    score={evaluation.teamScore}
                    weight={`${stageWeights?.team ?? 0}%`}
                    summary={(evaluation.teamData as any)?.memoNarrative || getSummaryFromData(evaluation.teamData)}
                    evaluationNote="Evaluates founding team backgrounds, relevant experience, founder-market fit, and execution capability. Includes previous startup experience, domain expertise, and team composition."
                    adminFeedback={{
                      sectionKey: "team",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.team?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "team",
                    }}
                  />

                  {/* Market */}
                  <MemoSection
                    title="Market Opportunity"
                    icon={Target}
                    score={evaluation.marketScore}
                    weight={`${stageWeights?.market ?? 0}%`}
                    summary={getSummaryFromData(evaluation.marketData)}
                    evaluationNote="Analyzes TAM/SAM/SOM, market timing, growth dynamics, and competitive landscape. Considers buyer behavior, regulatory factors, and technology adoption curves."
                    adminFeedback={{
                      sectionKey: "market",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.market?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "market",
                    }}
                    details={
                      <div className="space-y-4">
                        {(evaluation.marketData as any)?.marketDynamics && (
                          <div>
                            <h4 className="font-medium mb-2">Market Dynamics</h4>
                            <p>{(evaluation.marketData as any).marketDynamics}</p>
                          </div>
                        )}
                        {(evaluation.marketData as any)?.whyNow && (
                          <div>
                            <h4 className="font-medium mb-2">Why Now</h4>
                            <p>{(evaluation.marketData as any).whyNow}</p>
                          </div>
                        )}
                      </div>
                    }
                  />

                  {/* Product */}
                  <MemoSection
                    title="Product & Technology"
                    icon={Cpu}
                    score={evaluation.productScore}
                    weight={`${stageWeights?.product ?? 0}%`}
                    summary={getSummaryFromData(evaluation.productData)}
                    evaluationNote="Assesses product differentiation, technology readiness, scalability, and defensive moat potential."
                    adminFeedback={{
                      sectionKey: "product",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.product?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "product",
                    }}
                    details={
                      <div className="space-y-3">
                        {(evaluation.productData as any)?.one_liner && (
                          <p className="font-medium">{(evaluation.productData as any).one_liner}</p>
                        )}
                        {(evaluation.productData as any)?.product_differentiation && (
                          <div>
                            <h4 className="font-medium mb-1">Product Differentiation</h4>
                            <p>{typeof (evaluation.productData as any).product_differentiation === 'string' 
                              ? (evaluation.productData as any).product_differentiation 
                              : JSON.stringify((evaluation.productData as any).product_differentiation)}</p>
                          </div>
                        )}
                      </div>
                    }
                  />

                  {/* Business Model */}
                  <MemoSection
                    title="Business Model"
                    icon={Building2}
                    score={evaluation.businessModelScore}
                    weight={`${stageWeights?.businessModel ?? 0}%`}
                    summary={getSummaryFromData(evaluation.businessModelData)}
                    evaluationNote="Evaluates unit economics (CAC/LTV), revenue model sustainability, pricing strategy, and margin potential."
                    adminFeedback={{
                      sectionKey: "businessModel",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.businessModel?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "businessModel",
                    }}
                    details={
                      <div className="space-y-3">
                        {(evaluation.businessModelData as any)?.business_model_summary?.what_they_sell && (
                          <p>{(evaluation.businessModelData as any).business_model_summary.what_they_sell}</p>
                        )}
                        {(evaluation.businessModelData as any)?.bottom_line_vc_view?.projections && (
                          <p>{(evaluation.businessModelData as any).bottom_line_vc_view.projections}</p>
                        )}
                      </div>
                    }
                  />

                  {/* Traction */}
                  <MemoSection
                    title="Traction & Metrics"
                    icon={TrendingUp}
                    score={evaluation.tractionScore}
                    weight={`${stageWeights?.traction ?? 0}%`}
                    summary={getSummaryFromData(evaluation.tractionData)}
                    evaluationNote="Reviews revenue stage, growth signals, customer acquisition metrics, retention rates, and momentum credibility."
                    adminFeedback={{
                      sectionKey: "traction",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.traction?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "traction",
                    }}
                  />

                  {/* GTM */}
                  <MemoSection
                    title="Go-to-Market Strategy"
                    icon={Megaphone}
                    score={evaluation.gtmScore}
                    weight={`${stageWeights?.gtm ?? 0}%`}
                    summary={getSummaryFromData(evaluation.gtmData)}
                    evaluationNote="Analyzes sales motion, distribution channels, customer acquisition strategy, and virality potential."
                    adminFeedback={{
                      sectionKey: "gtm",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.gtm?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "gtm",
                    }}
                    details={
                      <div className="space-y-3">
                        {(evaluation.gtmData as any)?.gtm_summary?.positioning && (
                          <p>{(evaluation.gtmData as any).gtm_summary.positioning}</p>
                        )}
                        {(evaluation.gtmData as any)?.gtm_summary?.wedge && (
                          <div>
                            <h4 className="font-medium mb-1">Wedge Strategy</h4>
                            <p>{(evaluation.gtmData as any).gtm_summary.wedge}</p>
                          </div>
                        )}
                      </div>
                    }
                  />

                  {/* Competitive Advantage */}
                  <MemoSection
                    title="Competitive Advantage"
                    icon={Swords}
                    score={evaluation.competitiveAdvantageScore}
                    weight={`${stageWeights?.competitiveAdvantage ?? 0}%`}
                    summary={getSummaryFromData(evaluation.competitiveAdvantageData)}
                    evaluationNote="Analyzes competitive landscape, moat durability, barriers to entry, and network effects."
                    adminFeedback={{
                      sectionKey: "competitiveAdvantage",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.competitiveAdvantage?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "competitiveAdvantage",
                    }}
                  />

                  {/* Financials */}
                  <MemoSection
                    title="Financials"
                    icon={PiggyBank}
                    score={evaluation.financialsScore}
                    weight={`${stageWeights?.financials ?? 0}%`}
                    summary={getSummaryFromData(evaluation.financialsData)}
                    evaluationNote="Reviews capital efficiency, burn rate, runway, and path to profitability or next milestone."
                    adminFeedback={{
                      sectionKey: "financials",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.financials?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "financials",
                    }}
                  />

                  {/* Funding History Placeholder */}
                  <MemoSection
                    title="Funding History"
                    icon={Wallet}
                    summary="Previous fundraising rounds and cap table structure. This section will be enhanced with Crunchbase and Pitchbook integrations."
                    details={
                      <div className="space-y-4">
                        <div className="p-4 border border-dashed rounded-lg text-center text-muted-foreground">
                          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Funding history data coming soon.</p>
                        </div>
                        {(startup.roundSize || startup.valuation) && (
                          <FundingRoundCard
                            round={formatStage(startup.stage) || "Current Round"}
                            amount={formatCurrency(startup.roundSize)}
                            valuation={formatCurrency(startup.valuation)}
                          />
                        )}
                      </div>
                    }
                  />

                  {/* Deal Terms */}
                  <MemoSection
                    title="Deal Terms"
                    icon={Handshake}
                    score={evaluation.dealTermsScore}
                    weight={`${stageWeights?.dealTerms ?? 0}%`}
                    summary={getSummaryFromData(evaluation.dealTermsData)}
                    evaluationNote="Analyzes valuation, deal structure, investor protections, and alignment with market standards."
                    adminFeedback={{
                      sectionKey: "dealTerms",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.dealTerms?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "dealTerms",
                    }}
                  />

                  {/* Legal */}
                  <MemoSection
                    title="Legal & Regulatory"
                    icon={Scale}
                    score={evaluation.legalScore}
                    weight={`${stageWeights?.legal ?? 0}%`}
                    summary={getSummaryFromData(evaluation.legalData)}
                    evaluationNote="Assesses IP position, regulatory compliance, legal risks, and industry-specific requirements."
                    adminFeedback={{
                      sectionKey: "legal",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.legal?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "legal",
                    }}
                  />

                  {/* Exit */}
                  <MemoSection
                    title="Exit Potential"
                    icon={LogOut}
                    score={evaluation.exitPotentialScore}
                    weight={`${stageWeights?.exitPotential ?? 0}%`}
                    summary={getSummaryFromData(evaluation.exitPotentialData)}
                    evaluationNote="Evaluates M&A activity, IPO feasibility, strategic acquirer landscape, and exit timeline."
                    adminFeedback={{
                      sectionKey: "exitPotential",
                      evaluationId: evaluation.id,
                      existingComment: (evaluation.adminFeedback as any)?.exitPotential?.comment,
                      onReanalyze: handleSectionReanalyze,
                      isReanalyzing: reanalyzingSection === "exitPotential",
                    }}
                  />

                  {/* Key Due Diligence Areas */}
                  {investorMemo?.keyDueDiligenceAreas && investorMemo.keyDueDiligenceAreas.length > 0 && (
                    <div className="mt-6 pt-6 border-t" data-testid="section-due-diligence">
                      <div className="flex items-center gap-2 mb-4">
                        <Search className="w-5 h-5 text-muted-foreground" />
                        <h3 className="font-semibold text-base">Key Due Diligence Areas</h3>
                      </div>
                      <ul className="space-y-2">
                        {investorMemo.keyDueDiligenceAreas.map((area: string, i: number) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground shrink-0 mt-2" />
                            <span>{area}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  </CardContent>
                </Card>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No evaluation data</h3>
                    <p className="text-muted-foreground">Run an evaluation to generate the investment memo.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* TEAM TAB */}
            <TabsContent value="team" className="space-y-6">
              {evaluation && (
                <TeamCompositionSummary
                  teamScore={evaluation.teamScore || 0}
                  teamComposition={(evaluation.teamData as any)?.teamComposition || evaluation.teamComposition}
                  keyStrengths={(evaluation.teamData as any)?.keyStrengths}
                  keyRisks={(evaluation.teamData as any)?.keyRisks}
                  weight={stageWeights?.team}
                />
              )}

              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Team Member Profiles
                  </CardTitle>
                  <CardDescription>
                    LinkedIn-enriched profiles with experience timelines
                  </CardDescription>
                </CardHeader>
              </Card>

              {teamMembers.length > 0 ? (
                <TeamGrid members={teamMembers} showTimelines={true} />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No team data</h3>
                    <p className="text-muted-foreground">Team information has not been submitted.</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* COMPETITORS TAB */}
            <TabsContent value="competitors" className="space-y-6">
              {evaluation ? (
                <CompetitorAnalysis
                  productDefinition={(evaluation.competitiveAdvantageData as any)?.productDefinition}
                  directCompetitors={
                    (evaluation.competitiveAdvantageData as any)?.competitorProfiles?.length > 0 
                      ? (evaluation.competitiveAdvantageData as any)?.competitorProfiles 
                      : (evaluation.competitiveAdvantageData as any)?.["3_competitor_analysis"]?.direct_competitors || []
                  }
                  indirectCompetitors={
                    (evaluation.competitiveAdvantageData as any)?.indirectCompetitorProfiles?.length > 0 
                      ? (evaluation.competitiveAdvantageData as any)?.indirectCompetitorProfiles 
                      : (evaluation.competitiveAdvantageData as any)?.["3_competitor_analysis"]?.adjacent_indirect_competitors || []
                  }
                  hyperscalers={(evaluation.competitiveAdvantageData as any)?.["3_competitor_analysis"]?.hyperscalers || []}
                  marketLandscape={(evaluation.competitiveAdvantageData as any)?.marketLandscape}
                  sourceSummary={(evaluation.competitiveAdvantageData as any)?.sourceSummary}
                  companyName={startup.name}
                  basicLandscape={(evaluation.competitiveAdvantageData as any)?.competitorLandscape}
                  positioning={(evaluation.competitiveAdvantageData as any)?.positioning}
                  competitivePositioning={(evaluation.competitiveAdvantageData as any)?.competitivePositioning}
                  barriersToEntry={(evaluation.competitiveAdvantageData as any)?.barriersToEntry || (evaluation.competitiveAdvantageData as any)?.["4_barriers_to_entry"]}
                  keyStrengths={(evaluation.competitiveAdvantageData as any)?.keyStrengths || []}
                  keyRisks={(evaluation.competitiveAdvantageData as any)?.keyRisks || []}
                  competitiveAdvantageScore={evaluation.competitiveAdvantageScore}
                  competitiveAdvantageWeight={stageWeights?.competitiveAdvantage}
                />
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Competitor Analysis Yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Run an AI evaluation to generate comprehensive competitor research.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* SOURCES TAB */}
            <TabsContent value="sources" className="space-y-6">
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Data Sources
                  </CardTitle>
                  <CardDescription>
                    All sources used by AI agents to generate this evaluation
                  </CardDescription>
                </CardHeader>
              </Card>

              {(evaluation?.sources as any[])?.length > 0 ? (
                <div className="space-y-4">
                  {/* Documents Section */}
                  {(evaluation?.sources as any[])?.filter(s => s.category === "document").length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          Documents
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(evaluation?.sources as any[]).filter(s => s.category === "document").map((source, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-sm">{source.name}</h4>
                                <p className="text-xs text-muted-foreground">{source.description}</p>
                                {source.dataExtracted && (
                                  <p className="text-xs text-muted-foreground mt-1">{source.dataExtracted}</p>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">{source.agent}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(source.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Websites Section */}
                  {(evaluation?.sources as any[]).filter(s => s.category === "website").length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Globe className="w-4 h-4 text-green-500" />
                          Websites
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(evaluation?.sources as any[]).filter(s => s.category === "website").map((source, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-primary hover:underline flex items-center gap-1">
                                  {source.name}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <p className="text-xs text-muted-foreground">{source.description}</p>
                              </div>
                              <Badge variant="secondary" className="text-xs">{source.agent}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(source.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* LinkedIn Section */}
                  {(evaluation?.sources as any[]).filter(s => s.category === "linkedin").length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Linkedin className="w-4 h-4 text-blue-600" />
                          LinkedIn Profiles
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(evaluation?.sources as any[]).filter(s => s.category === "linkedin").map((source, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-primary hover:underline flex items-center gap-1">
                                  {source.name}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <p className="text-xs text-muted-foreground">{source.description}</p>
                                {source.dataExtracted && (
                                  <p className="text-xs text-muted-foreground mt-1">{source.dataExtracted}</p>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">{source.agent}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(source.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* AI Agents Section */}
                  {(evaluation?.sources as any[]).filter(s => s.category === "api").length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-purple-500" />
                          AI Analysis Agents
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(evaluation?.sources as any[]).filter(s => s.category === "api").map((source, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-sm">{source.agent}</h4>
                                <p className="text-xs text-muted-foreground">{source.description}</p>
                                {source.dataExtracted && (
                                  <Badge variant="outline" className="text-xs mt-1">{source.dataExtracted}</Badge>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">{source.name}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(source.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Database Section */}
                  {(evaluation?.sources as any[]).filter(s => s.category === "database").length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Database className="w-4 h-4 text-orange-500" />
                          Database Records
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(evaluation?.sources as any[]).filter(s => s.category === "database").map((source, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-sm">{source.name}</h4>
                                <p className="text-xs text-muted-foreground">{source.description}</p>
                                {source.dataExtracted && (
                                  <p className="text-xs text-muted-foreground mt-1">{source.dataExtracted}</p>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">{source.agent}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(source.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="border-dashed">
                  <CardContent className="p-12 text-center">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-semibold mb-2">No source data available</h3>
                    <p className="text-muted-foreground">
                      Source tracking was not enabled for this evaluation. Re-run the analysis to capture sources.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* EDIT TAB */}
            <TabsContent value="edit" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit className="w-5 h-5" />
                    Edit Startup Details
                  </CardTitle>
                  <CardDescription>
                    Modify startup information as an administrator
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">Company Name</Label>
                      <Input
                        id="edit-name"
                        value={editName !== null ? editName : startup.name}
                        onChange={(e) => setEditName(e.target.value)}
                        data-testid="input-edit-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-website">Website</Label>
                      <Input
                        id="edit-website"
                        value={editWebsite !== null ? editWebsite : (startup.website || "")}
                        onChange={(e) => setEditWebsite(e.target.value)}
                        data-testid="input-edit-website"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription !== null ? editDescription : (startup.description || "")}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={3}
                      data-testid="textarea-edit-description"
                    />
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-stage">Stage</Label>
                      <Select
                        value={editStage !== null ? editStage : (startup.stage || "")}
                        onValueChange={setEditStage}
                      >
                        <SelectTrigger data-testid="select-edit-stage">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pre_seed">Pre-Seed</SelectItem>
                          <SelectItem value="seed">Seed</SelectItem>
                          <SelectItem value="series_a">Series A</SelectItem>
                          <SelectItem value="series_b">Series B</SelectItem>
                          <SelectItem value="series_c">Series C+</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-sector">Sector</Label>
                      <Select
                        value={editSector !== null ? editSector : (startup.sector || "")}
                        onValueChange={setEditSector}
                      >
                        <SelectTrigger data-testid="select-edit-sector">
                          <SelectValue placeholder="Select sector" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ai_ml">AI/ML</SelectItem>
                          <SelectItem value="fintech">Fintech</SelectItem>
                          <SelectItem value="healthtech">Healthtech</SelectItem>
                          <SelectItem value="saas">SaaS</SelectItem>
                          <SelectItem value="consumer">Consumer</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-location">Location</Label>
                      <Input
                        id="edit-location"
                        value={editLocation !== null ? editLocation : (startup.location || "")}
                        onChange={(e) => setEditLocation(e.target.value)}
                        data-testid="input-edit-location"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <Select
                      value={editStatus !== null ? editStatus : (startup.status || "")}
                      onValueChange={setEditStatus}
                    >
                      <SelectTrigger data-testid="select-edit-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="analyzing">Analyzing</SelectItem>
                        <SelectItem value="pending_review">Pending Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Industry Selection */}
                  <TwoLevelIndustrySelector
                    groupValue={editSectorIndustryGroup !== null ? editSectorIndustryGroup : (startup.sectorIndustryGroup || "")}
                    industryValue={editSectorIndustry !== null ? editSectorIndustry : (startup.sectorIndustry || "")}
                    onGroupChange={(value) => {
                      setEditSectorIndustryGroup(value);
                      setEditSectorIndustry("");
                    }}
                    onIndustryChange={setEditSectorIndustry}
                  />

                  {/* Financial Details */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-round-size">Round Size</Label>
                      <Input
                        id="edit-round-size"
                        type="number"
                        value={editRoundSize !== null ? editRoundSize : (startup.roundSize || "")}
                        onChange={(e) => setEditRoundSize(e.target.value ? Number(e.target.value) : null)}
                        placeholder="Amount in dollars"
                        data-testid="input-edit-round-size"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-currency">Currency</Label>
                      <Select
                        value={editRoundCurrency !== null ? editRoundCurrency : (startup.roundCurrency || "USD")}
                        onValueChange={setEditRoundCurrency}
                      >
                        <SelectTrigger data-testid="select-edit-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD - US Dollar</SelectItem>
                          <SelectItem value="EUR">EUR - Euro</SelectItem>
                          <SelectItem value="GBP">GBP - British Pound</SelectItem>
                          <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                          <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Valuation Known Toggle */}
                  <div className="flex items-center space-x-4">
                    <Switch
                      id="edit-valuation-known"
                      checked={editValuationKnown !== null ? editValuationKnown : (startup.valuationKnown !== false)}
                      onCheckedChange={setEditValuationKnown}
                      data-testid="switch-edit-valuation-known"
                    />
                    <div className="flex items-center gap-2">
                      <Label htmlFor="edit-valuation-known">Target Valuation Known</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">To better assess and match with the right investors, we encourage you to provide an approximation.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Valuation & Valuation Type - only show when valuation is known */}
                  {(editValuationKnown !== null ? editValuationKnown : (startup.valuationKnown !== false)) && (
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-valuation">Target Valuation</Label>
                        <Input
                          id="edit-valuation"
                          type="number"
                          value={editValuation !== null ? editValuation : (startup.valuation || "")}
                          onChange={(e) => setEditValuation(e.target.value ? Number(e.target.value) : null)}
                          placeholder="Amount in dollars"
                          data-testid="input-edit-valuation"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Valuation Type</Label>
                        <RadioGroup
                          value={editValuationType !== null ? editValuationType : (startup.valuationType || "pre_money")}
                          onValueChange={setEditValuationType}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="pre_money" id="pre_money" />
                            <Label htmlFor="pre_money" className="cursor-pointer">Pre-money</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="post_money" id="post_money" />
                            <Label htmlFor="post_money" className="cursor-pointer">Post-money</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}

                  {/* Raise Type */}
                  <div className="space-y-2">
                    <Label htmlFor="edit-raise-type">Raise Type</Label>
                    <Select
                      value={editRaiseType !== null ? editRaiseType : (startup.raiseType || "")}
                      onValueChange={setEditRaiseType}
                    >
                      <SelectTrigger data-testid="select-edit-raise-type">
                        <SelectValue placeholder="Select raise type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="safe">SAFE</SelectItem>
                        <SelectItem value="convertible_note">Convertible Note</SelectItem>
                        <SelectItem value="equity">Equity</SelectItem>
                        <SelectItem value="safe_equity">SAFE + Equity</SelectItem>
                        <SelectItem value="undecided">Undecided</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Lead Investor */}
                  <div className="grid md:grid-cols-2 gap-4 items-end">
                    <div className="flex items-center space-x-4">
                      <Switch
                        id="edit-lead-secured"
                        checked={editLeadSecured !== null ? editLeadSecured : (startup.leadSecured || false)}
                        onCheckedChange={setEditLeadSecured}
                        data-testid="switch-edit-lead-secured"
                      />
                      <Label htmlFor="edit-lead-secured">Lead Investor Secured</Label>
                    </div>
                    {(editLeadSecured !== null ? editLeadSecured : startup.leadSecured) && (
                      <div className="space-y-2">
                        <Label htmlFor="edit-lead-investor-name">Lead Investor Name</Label>
                        <Input
                          id="edit-lead-investor-name"
                          value={editLeadInvestorName !== null ? editLeadInvestorName : (startup.leadInvestorName || "")}
                          onChange={(e) => setEditLeadInvestorName(e.target.value)}
                          placeholder="Lead investor name"
                          data-testid="input-edit-lead-investor-name"
                        />
                      </div>
                    )}
                  </div>

                  {/* Previous Funding Section */}
                  <div className="border-t pt-4">
                    <div className="flex items-center space-x-4 mb-4">
                      <Switch
                        id="edit-has-previous-funding"
                        checked={editHasPreviousFunding !== null ? editHasPreviousFunding : (startup.hasPreviousFunding || false)}
                        onCheckedChange={setEditHasPreviousFunding}
                        data-testid="switch-edit-has-previous-funding"
                      />
                      <Label htmlFor="edit-has-previous-funding">Has Previous Funding</Label>
                    </div>

                    {(editHasPreviousFunding !== null ? editHasPreviousFunding : startup.hasPreviousFunding) && (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-previous-funding-amount">Previous Amount Raised</Label>
                          <Input
                            id="edit-previous-funding-amount"
                            type="number"
                            value={editPreviousFundingAmount !== null ? editPreviousFundingAmount : (startup.previousFundingAmount || "")}
                            onChange={(e) => setEditPreviousFundingAmount(e.target.value ? Number(e.target.value) : null)}
                            placeholder="Amount in dollars"
                            data-testid="input-edit-previous-funding-amount"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-previous-funding-currency">Currency</Label>
                          <Select
                            value={editPreviousFundingCurrency !== null ? editPreviousFundingCurrency : (startup.previousFundingCurrency || "USD")}
                            onValueChange={setEditPreviousFundingCurrency}
                          >
                            <SelectTrigger data-testid="select-edit-previous-funding-currency">
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                              <SelectItem value="CAD">CAD</SelectItem>
                              <SelectItem value="AUD">AUD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-previous-round-type">Previous Round Type</Label>
                          <Input
                            id="edit-previous-round-type"
                            value={editPreviousRoundType !== null ? editPreviousRoundType : (startup.previousRoundType || "")}
                            onChange={(e) => setEditPreviousRoundType(e.target.value)}
                            placeholder="e.g., Seed, Pre-Seed"
                            data-testid="input-edit-previous-round-type"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-previous-investors">Previous Investors</Label>
                          <Input
                            id="edit-previous-investors"
                            value={editPreviousInvestors !== null ? editPreviousInvestors : (startup.previousInvestors || "")}
                            onChange={(e) => setEditPreviousInvestors(e.target.value)}
                            placeholder="Investor names"
                            data-testid="input-edit-previous-investors"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contact Information Section */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-4">Contact Information</h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-contact-name">Contact Name</Label>
                        <Input
                          id="edit-contact-name"
                          value={editContactName !== null ? editContactName : (startup.contactName || "")}
                          onChange={(e) => setEditContactName(e.target.value)}
                          placeholder="Full name"
                          data-testid="input-edit-contact-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-contact-email">Contact Email</Label>
                        <Input
                          id="edit-contact-email"
                          type="email"
                          value={editContactEmail !== null ? editContactEmail : (startup.contactEmail || "")}
                          onChange={(e) => setEditContactEmail(e.target.value)}
                          placeholder="email@example.com"
                          data-testid="input-edit-contact-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-contact-phone">Contact Phone</Label>
                        <div className="flex gap-2">
                          <Select
                            value={editContactPhoneCountryCode !== null ? editContactPhoneCountryCode : (startup.contactPhoneCountryCode || "1")}
                            onValueChange={setEditContactPhoneCountryCode}
                          >
                            <SelectTrigger className="w-24" data-testid="select-edit-phone-country-code">
                              <SelectValue placeholder="+" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">+1</SelectItem>
                              <SelectItem value="44">+44</SelectItem>
                              <SelectItem value="49">+49</SelectItem>
                              <SelectItem value="33">+33</SelectItem>
                              <SelectItem value="91">+91</SelectItem>
                              <SelectItem value="86">+86</SelectItem>
                              <SelectItem value="81">+81</SelectItem>
                              <SelectItem value="61">+61</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            id="edit-contact-phone"
                            value={editContactPhone !== null ? editContactPhone : (startup.contactPhone || "")}
                            onChange={(e) => setEditContactPhone(e.target.value)}
                            placeholder="Phone number"
                            className="flex-1"
                            data-testid="input-edit-contact-phone"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {hasEditChanges && (
                    <div className="flex justify-end pt-4 border-t">
                      <Button
                        onClick={handleSaveChanges}
                        disabled={updateStartupMutation.isPending}
                        data-testid="button-save-changes"
                      >
                        {updateStartupMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* RAW TAB */}
            <TabsContent value="raw" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="w-5 h-5" />
                    Raw Data
                  </CardTitle>
                  <CardDescription>
                    Complete startup and evaluation data in JSON format
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4 overflow-auto max-h-[600px]">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify({ startup, evaluation }, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Admin Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-notes">Notes</Label>
                <Textarea
                  id="admin-notes"
                  placeholder="Add notes about this review..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  data-testid="textarea-admin-notes"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="score-override">Score Override</Label>
                <Input
                  id="score-override"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Leave empty to use AI score"
                  value={scoreOverride || ""}
                  onChange={(e) => setScoreOverride(e.target.value ? Number(e.target.value) : null)}
                  data-testid="input-score-override"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-4">
                <Button
                  variant="default"
                  className="bg-chart-2 hover:bg-chart-2/90"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                  data-testid="button-reject"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Reject
                </Button>
              </div>

              {startup.status === "approved" && (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => alignmentMutation.mutate()}
                  disabled={alignmentMutation.isPending}
                  data-testid="button-run-alignment"
                >
                  {alignmentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Target className="w-4 h-4 mr-2" />
                  )}
                  Run Thesis Alignment
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full mt-2 text-destructive border-destructive/50 hover:bg-destructive/10"
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete Submission
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the startup submission "{startup.name}" and all associated evaluation data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Score</span>
                <span className="font-semibold">{computedOverallScore || "N/A"}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Percentile</span>
                <span className="font-semibold">
                  {startup.percentileRank ? `Top ${100 - startup.percentileRank}%` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Round</span>
                <span className="font-semibold text-primary">{formatCurrency(startup.roundSize)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valuation</span>
                <span className="font-semibold text-primary">{formatCurrency(startup.valuation)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Links & Docs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Links & Docs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {startup.website && (
                <a
                  href={startup.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  data-testid="link-startup-website"
                >
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="text-sm flex-1">Website</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              )}

              {startup.files && startup.files.length > 0 && (
                <div className="space-y-4">
                  {startup.files.map((file, idx) => (
                    <div key={idx} className="space-y-2">
                      <a
                        href={file.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                        data-testid={`link-file-${idx}`}
                      >
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-sm flex-1">{file.name}</span>
                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                      </a>
                      <div className="border rounded-lg overflow-hidden bg-muted/20">
                        {file.type === 'application/pdf' || file.path.toLowerCase().endsWith('.pdf') ? (
                          <iframe
                            src={file.path}
                            className="w-full h-[250px]"
                            title={`Preview: ${file.name}`}
                          />
                        ) : file.type.startsWith('image/') || file.path.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                          <img
                            src={file.path}
                            alt={file.name}
                            className="w-full h-auto max-h-[250px] object-contain"
                          />
                        ) : (
                          <iframe
                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(window.location.origin + file.path)}&embedded=true`}
                            className="w-full h-[250px]"
                            title={`Preview: ${file.name}`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
