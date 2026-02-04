import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScoreRing } from "@/components/ScoreRing";
import { StatusBadge } from "@/components/StatusBadge";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { MemoSection, CompetitorCard, FundingRoundCard } from "@/components/MemoSection";
import { TeamGrid } from "@/components/TeamProfile";
import { TeamCompositionSummary } from "@/components/TeamCompositionSummary";
import { CompetitorAnalysis } from "@/components/CompetitorAnalysis";
import { InsightsTabContent } from "@/components/startup-view/InsightsTabContent";
import { ProductTabContent } from "@/components/startup-view/ProductTabContent";
import { 
  ArrowLeft, 
  Globe,
  FileText,
  CheckCircle,
  AlertTriangle,
  Target,
  Users,
  TrendingUp,
  Building2,
  ExternalLink,
  Lightbulb,
  Clock,
  Cpu,
  DollarSign,
  Megaphone,
  PiggyBank,
  Shield,
  Scale,
  Handshake,
  LogOut,
  ChevronRight,
  FileImage,
  File,
  Eye,
  Download,
  ChevronDown,
  FileBarChart,
  Briefcase,
  MapPin,
  BarChart3,
  Swords,
  Wallet,
  ThumbsUp,
  ThumbsDown,
  Linkedin,
  Database,
  Sparkles,
  Search
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Startup, StartupEvaluation, ScoringWeights } from "@shared/schema";
import { computeWeightedScore, type SectionScores } from "@/lib/score-utils";

interface StageScoringWeightResponse {
  id: number;
  stage: string;
  weights: ScoringWeights;
  rationale: Record<string, string>;
  overallRationale: string | null;
}

interface InvestorScoringPreference {
  id: number;
  investorId: number;
  stage: string;
  useCustomWeights: boolean;
  customWeights: ScoringWeights | null;
}

// Note: Weights are always fetched from database via /api/scoring-weights
// No hardcoded defaults - components must wait for weights to load

interface UploadedFile {
  path: string;
  name: string;
  type: string;
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

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return FileImage;
  if (type === 'application/pdf') return FileText;
  return File;
}

function isPreviewable(type: string): boolean {
  return type.startsWith('image/') || type === 'application/pdf';
}

function DocumentPreviewDialog({
  file,
  open,
  onClose
}: {
  file: UploadedFile | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!file) return null;

  const previewUrl = file.path;
  const isPdf = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" data-testid="dialog-document-preview">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {file.name}
          </DialogTitle>
          <DialogDescription>Document preview</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden min-h-[400px]">
          {isPdf && (
            <iframe
              src={previewUrl}
              className="w-full h-full min-h-[500px] rounded-lg border"
              title={file.name}
            />
          )}
          {isImage && (
            <div className="flex items-center justify-center h-full">
              <img 
                src={previewUrl} 
                alt={file.name}
                className="max-w-full max-h-[500px] object-contain rounded-lg"
              />
            </div>
          )}
          {!isPdf && !isImage && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <File className="w-16 h-16 mb-4" />
              <p>Preview not available for this file type</p>
              <Button asChild className="mt-4">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  <Download className="w-4 h-4 mr-2" />
                  Download File
                </a>
              </Button>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button asChild>
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in New Tab
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ThesisAlignment {
  score: number | null;
  rationale: string | null;
}

interface StartupDetail extends Startup {
  evaluation?: StartupEvaluation;
  thesisAlignment?: ThesisAlignment;
}

interface StartupDetailPageProps {
  basePath: string;
}

function formatCurrency(value: number | null | undefined, currency: string = "USD"): string {
  if (!value) return "N/A";
  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  if (value >= 1000000000) return `${currencySymbol}${(value / 1000000000).toFixed(1)}B ${currency}`;
  if (value >= 1000000) return `${currencySymbol}${(value / 1000000).toFixed(1)}M ${currency}`;
  if (value >= 1000) return `${currencySymbol}${(value / 1000).toFixed(0)}K ${currency}`;
  return `${currencySymbol}${value.toLocaleString()} ${currency}`;
}

function formatCurrencyFull(value: number | null | undefined, currency: string = "USD"): string {
  if (!value) return "N/A";
  const currencySymbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
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

function safeRenderValue(value: any, fallback: string = "Analysis available"): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    // Try common text field names
    const textFields = ['assessment', 'description', 'summary', 'overview', 'text', 
                        'differentiation', 'teamBalance', 'pathToIPO', 'ipStrength', 
                        'impactAssessment'];
    for (const field of textFields) {
      if (typeof value[field] === 'string') return value[field];
    }
    return fallback;
  }
  return String(value);
}

export default function StartupDetailPage({ basePath }: StartupDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const isInvestor = basePath === "/investor";
  const isAdmin = basePath === "/admin";
  const canDownloadPDF = isInvestor || isAdmin;
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);

  const { toast } = useToast();
  const prevStatusRef = useRef<string | undefined>(undefined);
  const [analysisJustCompleted, setAnalysisJustCompleted] = useState(false);
  
  const getApiPath = () => {
    if (basePath === "/investor") return "/api/investor/startups";
    if (basePath === "/admin") return "/api/admin/startups";
    return "/api/startups";
  };
  
  const { data: startup, isLoading, error } = useQuery<StartupDetail>({
    queryKey: [getApiPath(), id],
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data as StartupDetail | undefined;
      return data?.status === "analyzing" ? 5000 : false;
    },
  });

  // Show notification when analysis completes and refresh data
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    
    if (startup?.status && prevStatusRef.current === "analyzing" && startup.status !== "analyzing") {
      const newStatus = startup.status;
      toast({
        title: "Analysis Complete",
        description: `The startup has been analyzed and moved to "${newStatus === "pending_review" ? "Pending Review" : newStatus}" status.`,
      });
      // Enable mount animation for memo sections
      setAnalysisJustCompleted(true);
      // Clear the animation flag after sections have rendered
      timer = setTimeout(() => setAnalysisJustCompleted(false), 3000);
      // Invalidate related queries to update any other views
      queryClient.invalidateQueries({ queryKey: ["/api/startups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investor/startups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/startups"] });
    }
    
    // Always update ref to track current status
    prevStatusRef.current = startup?.status;
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [startup?.status, toast]);

  // Fetch scoring weights for all stages (public endpoint for all authenticated users)
  // Always enabled so weights are available as soon as startup data loads
  const { data: allScoringWeights, isLoading: weightsLoading } = useQuery<StageScoringWeightResponse[]>({
    queryKey: ["/api/scoring-weights"],
  });

  // Fetch investor's custom scoring preferences (only for investors)
  const { data: investorPreferences } = useQuery<InvestorScoringPreference[]>({
    queryKey: ["/api/investor/scoring-preferences"],
    enabled: isInvestor && !!startup?.stage,
  });

  // Get weights for this startup's stage
  // For investors: use custom weights if enabled, otherwise use defaults
  // For admins/founders: use default weights from database
  const stageWeights: ScoringWeights | null = (() => {
    // If weights aren't loaded yet or no startup/stage, return null
    if (!startup?.stage || !allScoringWeights || allScoringWeights.length === 0) {
      return null;
    }
    
    // Check if investor has custom weights for this stage
    if (isInvestor && investorPreferences) {
      const investorPref = investorPreferences.find(p => p.stage === startup.stage);
      if (investorPref?.useCustomWeights && investorPref.customWeights) {
        return investorPref.customWeights;
      }
    }
    
    // Get stage-specific weights from database
    const stageData = allScoringWeights.find(sw => sw.stage === startup.stage);
    if (stageData?.weights) {
      return stageData.weights;
    }
    
    // Stage not found in database - this shouldn't happen if DB is seeded properly
    console.error(`[Weights] No weights found for stage "${startup.stage}" - please seed the database`);
    return null;
  })();
  
  // Flag to indicate if weights are still loading (for potential loading state display)
  const weightsReady = !weightsLoading && allScoringWeights && allScoringWeights.length > 0;
  
  // Check if custom weights are being used (for display purposes)
  const isUsingCustomWeights = (() => {
    if (!isInvestor || !startup?.stage || !investorPreferences) return false;
    const investorPref = investorPreferences.find(p => p.stage === startup.stage);
    return investorPref?.useCustomWeights && investorPref.customWeights != null;
  })();

  // Compute the overall score using the active weights (custom or default)
  // This ensures investor custom weights actually affect the displayed score
  const computedOverallScore = (() => {
    if (!startup?.evaluation || !stageWeights) return null;
    const evaluation = startup.evaluation;
    
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
  
  // Always use computed score based on current weights (ensures displayed score matches displayed weights)
  // Fall back to stored score only if computation isn't possible
  const displayOverallScore = computedOverallScore !== null 
    ? computedOverallScore 
    : (startup?.evaluation?.overallScore ?? 0);

  const handlePreview = (file: UploadedFile) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setPreviewFile(null);
  };

  const handleDownloadPDF = async () => {
    if (!id || isDownloadingPDF) return;
    
    setIsDownloadingPDF(true);
    try {
      const response = await fetch(`/api/startups/${id}/memo.pdf`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${startup?.name || 'startup'}_Investment_Memo.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert(error instanceof Error ? error.message : 'Failed to download PDF');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!id || isDownloadingReport) return;
    
    setIsDownloadingReport(true);
    try {
      const response = await fetch(`/api/startups/${id}/report.pdf`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate Report PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${startup?.name || 'startup'}_Analysis_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download Report PDF:', error);
      alert(error instanceof Error ? error.message : 'Failed to download Report PDF');
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const uploadedFiles = (startup?.files as UploadedFile[] | undefined) || [];

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-destructive">Error loading startup</h2>
        <p className="text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button asChild className="mt-4">
          <Link href={basePath}>Back to Dashboard</Link>
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
          <Link href={basePath}>Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const evaluation = startup.evaluation;
  const investorMemo = evaluation?.investorMemo as any;
  const founderReport = evaluation?.founderReport as any;

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
        experience: linkedinData.experienceDetails || linkedinData.experience || founderData?.previousCompanies?.map((c: string) => ({ company: c })) || [],
        education: linkedinData.educationDetails || linkedinData.education || founderData?.education || [],
        skills: linkedinData.skills || founderData?.skills || [],
        fmfScore: teamEvalData?.fmfScore || memberEval?.fmfScore || founderData?.founderMarketFit || memberEval?.linkedinAnalysis?.founderMarketFit,
        relevantExperience: teamEvalData?.relevantExperience || "",
        background: teamEvalData?.background || "",
      };
    });
  };
  
  const teamMembers = getTeamMembers();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <Button variant="ghost" size="icon" asChild data-testid="button-back">
          <Link href={basePath}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{startup.name}</h1>
            {startup.sector && <Badge variant="secondary">{startup.sector}</Badge>}
            {evaluation && canDownloadPDF && (
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
                data-testid="link-website"
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
      </div>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog 
        file={previewFile} 
        open={previewOpen} 
        onClose={handleClosePreview} 
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content - 3 Section Tabs */}
        <div className="lg:col-span-2 space-y-6">
          {evaluation ? (
            <Tabs defaultValue="summary" className="space-y-6">
              <TabsList className={`w-full grid ${isInvestor ? 'grid-cols-6' : 'grid-cols-4'}`}>
                <TabsTrigger value="summary" data-testid="tab-summary">Summary</TabsTrigger>
                {isInvestor ? (
                  <TabsTrigger value="memo" data-testid="tab-memo">Memo</TabsTrigger>
                ) : (
                  <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
                )}
                <TabsTrigger value="product" data-testid="tab-product">Product</TabsTrigger>
                <TabsTrigger value="team" data-testid="tab-team">Team</TabsTrigger>
                {isInvestor && (
                  <TabsTrigger value="competitors" data-testid="tab-competitors">Competitors</TabsTrigger>
                )}
                {isInvestor && (
                  <TabsTrigger value="sources" data-testid="tab-sources">Sources</TabsTrigger>
                )}
              </TabsList>

              {/* SUMMARY TAB */}
              <TabsContent value="summary" className="space-y-6">
                {/* Score + Deal Info Card */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Score - only for investors */}
                      {isInvestor && (
                        <div className="flex flex-col items-center text-center">
                          <ScoreRing score={displayOverallScore} size="lg" />
                          {startup.percentileRank && (
                            <Badge variant="outline" className="mt-2">
                              Top {100 - startup.percentileRank}%
                            </Badge>
                          )}
                        </div>
                      )}
                      
                      {/* Deal Info Grid */}
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

                {/* Thesis Alignment (for investors) */}
                {isInvestor && startup.thesisAlignment && (
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Target className="w-5 h-5 text-primary" />
                          Thesis Alignment
                        </CardTitle>
                        {startup.thesisAlignment.score !== null && startup.thesisAlignment.score !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-primary">
                              {Math.round(startup.thesisAlignment.score)}%
                            </span>
                            <span className="text-xs text-muted-foreground">fit</span>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {startup.thesisAlignment.rationale ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {startup.thesisAlignment.rationale}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No thesis alignment analysis available yet.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Deal Snapshot - 2 Min Pitch (for investors) */}
                {isInvestor && (investorMemo?.dealHighlights?.length > 0 || (evaluation?.keyStrengths as string[] || []).length > 0) && (
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

                {/* Founder Report (for founders) */}
                {!isInvestor && founderReport && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-primary" />
                        Your Evaluation Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {founderReport.summary && (
                        <p className="text-sm leading-relaxed">{founderReport.summary}</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Strengths & Risks */}
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

                {/* Section Scores Overview - Investors only */}
                {isInvestor && stageWeights && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Section Scores
                        {isUsingCustomWeights && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            Custom Weights
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
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
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {(evaluation.recommendations as string[] || []).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-primary" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {(evaluation.recommendations as string[] || []).map((rec, i) => (
                          <li key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="text-sm">{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* PRODUCT TAB */}
              <TabsContent value="product" className="space-y-4">
                <ProductTabContent startup={startup} evaluation={evaluation} productWeight={stageWeights?.product} />
              </TabsContent>

              {/* MEMO TAB - All 11 sections in VC order */}
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
                      animateOnMount={analysisJustCompleted}
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
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.teamScore}
                      weight={`${stageWeights?.team ?? 0}%`}
                      summary={(evaluation.teamData as any)?.memoNarrative || getSummaryFromData(evaluation.teamData)}
                      evaluationNote="Evaluates founding team backgrounds, relevant experience, founder-market fit, and execution capability. Includes previous startup experience, domain expertise, and team composition."
                    />

                    {/* Market */}
                    <MemoSection
                      title="Market Opportunity"
                      icon={Target}
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.marketScore}
                      weight={`${stageWeights?.market ?? 0}%`}
                      summary={getSummaryFromData(evaluation.marketData)}
                      evaluationNote="Analyzes TAM/SAM/SOM, market timing, growth dynamics, and competitive landscape. Considers buyer behavior, regulatory factors, and technology adoption curves."
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
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.productScore}
                      weight={`${stageWeights?.product ?? 0}%`}
                      summary={getSummaryFromData(evaluation.productData)}
                      evaluationNote="Assesses product differentiation, technology readiness, scalability, and defensive moat potential."
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
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.businessModelScore}
                      weight={`${stageWeights?.businessModel ?? 0}%`}
                      summary={getSummaryFromData(evaluation.businessModelData)}
                      evaluationNote="Evaluates unit economics (CAC/LTV), revenue model sustainability, pricing strategy, and margin potential."
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
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.tractionScore}
                      weight={`${stageWeights?.traction ?? 0}%`}
                      summary={getSummaryFromData(evaluation.tractionData)}
                      evaluationNote="Reviews revenue stage, growth signals, customer acquisition metrics, retention rates, and momentum credibility."
                    />

                    {/* GTM */}
                    <MemoSection
                      title="Go-to-Market Strategy"
                      icon={Megaphone}
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.gtmScore}
                      weight={`${stageWeights?.gtm ?? 0}%`}
                      summary={getSummaryFromData(evaluation.gtmData)}
                      evaluationNote="Analyzes sales motion, distribution channels, customer acquisition strategy, and virality potential."
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
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.competitiveAdvantageScore}
                      weight={`${stageWeights?.competitiveAdvantage ?? 0}%`}
                      summary={getSummaryFromData(evaluation.competitiveAdvantageData)}
                      evaluationNote="Analyzes competitive landscape, moat durability, barriers to entry, and network effects."
                    />

                    {/* Financials */}
                    <MemoSection
                      title="Financials"
                      icon={PiggyBank}
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.financialsScore}
                      weight={`${stageWeights?.financials ?? 0}%`}
                      summary={getSummaryFromData(evaluation.financialsData)}
                      evaluationNote="Reviews capital efficiency, burn rate, runway, and path to profitability or next milestone."
                    />

                    {/* Funding History Placeholder */}
                    <MemoSection
                      title="Funding History"
                      icon={Wallet}
                      animateOnMount={analysisJustCompleted}
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
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.dealTermsScore}
                      weight={`${stageWeights?.dealTerms ?? 0}%`}
                      summary={getSummaryFromData(evaluation.dealTermsData)}
                      evaluationNote="Analyzes valuation, deal structure, investor protections, and alignment with market standards."
                    />

                    {/* Legal */}
                    <MemoSection
                      title="Legal & Regulatory"
                      icon={Scale}
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.legalScore}
                      weight={`${stageWeights?.legal ?? 0}%`}
                      summary={getSummaryFromData(evaluation.legalData)}
                      evaluationNote="Assesses IP position, regulatory compliance, legal risks, and industry-specific requirements."
                    />

                    {/* Exit */}
                    <MemoSection
                      title="Exit Potential"
                      icon={LogOut}
                      animateOnMount={analysisJustCompleted}
                      score={evaluation.exitPotentialScore}
                      weight={`${stageWeights?.exitPotential ?? 0}%`}
                      summary={getSummaryFromData(evaluation.exitPotentialData)}
                      evaluationNote="Evaluates M&A activity, IPO feasibility, strategic acquirer landscape, and exit timeline."
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
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      No evaluation data available
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* INSIGHTS TAB - Founders only */}
              {!isInvestor && (
                <TabsContent value="insights" className="space-y-6" data-testid="tab-content-insights">
                  <InsightsTabContent evaluation={evaluation} />
                </TabsContent>
              )}

              {/* TEAM TAB */}
              <TabsContent value="team" className="space-y-6">
                {evaluation && (
                  <TeamCompositionSummary
                    teamScore={evaluation.teamScore || 0}
                    teamComposition={(evaluation.teamData as any)?.teamComposition || (evaluation as any).teamComposition}
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
              {isInvestor && (
                <TabsContent value="competitors" className="space-y-6">
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
                </TabsContent>
              )}

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
                    {(evaluation.sources as any[]).filter(s => s.category === "document").length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-500" />
                            Documents
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(evaluation.sources as any[]).filter(s => s.category === "document").map((source, idx) => (
                            <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-medium text-sm">{source.name}</h4>
                                  <p className="text-xs text-muted-foreground">{source.description}</p>
                                  {source.dataExtracted && (
                                    <p className="text-xs text-muted-foreground mt-1">{source.dataExtracted}</p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">{source.agent}</Badge>
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
                    {(evaluation.sources as any[]).filter(s => s.category === "website").length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Globe className="w-4 h-4 text-green-500" />
                            Websites
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(evaluation.sources as any[]).filter(s => s.category === "website").map((source, idx) => (
                            <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-primary hover:underline flex items-center gap-1">
                                    {source.name}
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                  <p className="text-xs text-muted-foreground">{source.description}</p>
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">{source.agent}</Badge>
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
                    {(evaluation.sources as any[]).filter(s => s.category === "linkedin").length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Linkedin className="w-4 h-4 text-blue-600" />
                            LinkedIn Profiles
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(evaluation.sources as any[]).filter(s => s.category === "linkedin").map((source, idx) => (
                            <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-primary hover:underline flex items-center gap-1">
                                    {source.name}
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                  <p className="text-xs text-muted-foreground">{source.description}</p>
                                  {source.dataExtracted && (
                                    <p className="text-xs text-muted-foreground mt-1">{source.dataExtracted}</p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">{source.agent}</Badge>
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
                    {(evaluation.sources as any[]).filter(s => s.category === "api").length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            AI Analysis Agents
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(evaluation.sources as any[]).filter(s => s.category === "api").map((source, idx) => (
                            <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-medium text-sm">{source.agent}</h4>
                                  <p className="text-xs text-muted-foreground">{source.description}</p>
                                  {source.dataExtracted && (
                                    <Badge variant="outline" className="text-xs mt-1">{source.dataExtracted}</Badge>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">{source.name}</Badge>
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
                    {(evaluation.sources as any[]).filter(s => s.category === "database").length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Database className="w-4 h-4 text-orange-500" />
                            Database Records
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(evaluation.sources as any[]).filter(s => s.category === "database").map((source, idx) => (
                            <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-medium text-sm">{source.name}</h4>
                                  <p className="text-xs text-muted-foreground">{source.description}</p>
                                  {source.dataExtracted && (
                                    <p className="text-xs text-muted-foreground mt-1">{source.dataExtracted}</p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-xs shrink-0">{source.agent}</Badge>
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
            </Tabs>
          ) : (
            /* No Evaluation Yet */
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                {stageWeights ? (
                  <AnalysisProgress startupId={startup.id} isAnalyzing={startup.status === "analyzing"} weights={stageWeights} />
                ) : (
                  <div className="text-center text-muted-foreground">Loading weights...</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Overall Score</span>
                <span className="font-semibold">{displayOverallScore || "N/A"}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Percentile</span>
                <span className="font-semibold">
                  {startup.percentileRank ? `Top ${100 - startup.percentileRank}%` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Round Size</span>
                <span className="font-semibold text-primary">{formatCurrency(startup.roundSize)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valuation</span>
                <span className="font-semibold text-primary">{formatCurrency(startup.valuation)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Documents */}
          {uploadedFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {uploadedFiles.map((file, idx) => {
                  const FileIcon = getFileIcon(file.type);
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm flex-1 truncate">{file.name}</span>
                      <div className="flex gap-1">
                        {isPreviewable(file.type) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handlePreview(file)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          asChild
                        >
                          <a href={file.path} target="_blank" rel="noopener noreferrer">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {startup.website && (
                <a
                  href={startup.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="text-sm flex-1">Website</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              )}
              {startup.pitchDeckUrl && (
                <a
                  href={startup.pitchDeckUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="text-sm flex-1">Pitch Deck</span>
                  <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </a>
              )}
            </CardContent>
          </Card>

          {/* Document Previews */}
          {startup.pitchDeckUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Pitch Deck Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg overflow-hidden bg-muted/20">
                  {startup.pitchDeckUrl.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      src={startup.pitchDeckUrl}
                      className="w-full h-[400px]"
                      title="Pitch Deck Preview"
                    />
                  ) : startup.pitchDeckUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                    <img
                      src={startup.pitchDeckUrl}
                      alt="Pitch Deck"
                      className="w-full h-auto max-h-[400px] object-contain"
                    />
                  ) : (
                    <iframe
                      src={`https://docs.google.com/viewer?url=${encodeURIComponent(startup.pitchDeckUrl)}&embedded=true`}
                      className="w-full h-[400px]"
                      title="Pitch Deck Preview"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Click the link above to view in full screen
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
