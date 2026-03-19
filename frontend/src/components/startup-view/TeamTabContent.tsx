import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TeamGrid } from "@/components/TeamProfile";
import { SectionScoreCard } from "@/components/SectionScoreCard";
import { DataGapsSection, parseDataGapItems } from "@/components/DataGapsSection";
import { MarkdownText } from "@/components/MarkdownText";
import {
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Briefcase,
  Code,
  Globe,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Evaluation } from "@/types/evaluation";
import type { TeamMemberSource } from "@/components/TeamProfile";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  name: string;
  role: string;
  discovered?: boolean;
  source?: TeamMemberSource;
  linkedinUrl?: string;
  headline?: string;
  summary?: string;
  profilePictureUrl?: string;
  location?: string;
  experience?: Array<{
    title?: string;
    position?: string;
    company?: string;
    location?: string;
    startDate?: string;
    start?: string;
    endDate?: string;
    end?: string;
    description?: string;
    isCurrent?: boolean;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    fieldOfStudy?: string;
    startDate?: string;
    endDate?: string;
  }>;
  skills?: string[];
  fmfScore?: number;
  relevantExperience?: string;
  background?: string;
  bio?: string;
  imageUrl?: string;
}

interface TeamTabContentProps {
  evaluation: Evaluation | null;
  teamMembers: TeamMember[];
  showScores?: boolean;
  teamWeight?: number;
  companyName?: string;
}

interface SubScoreItem {
  dimension: string;
  weight: number;
  score: number;
}

interface TeamComposition {
  businessLeadership: boolean;
  technicalCapability: boolean;
  domainExpertise: boolean;
  gtmCapability: boolean;
  sentence?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Safe accessors
// ---------------------------------------------------------------------------

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toSubScores(value: unknown): SubScoreItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): SubScoreItem | null => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;
      const dimension = typeof r.dimension === "string" ? r.dimension.trim() : "";
      const weight = typeof r.weight === "number" ? r.weight : null;
      const score = typeof r.score === "number" ? r.score : null;
      if (!dimension || weight === null || score === null) return null;
      return { dimension, weight, score };
    })
    .filter((item): item is SubScoreItem => item !== null);
}

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase() || "";
}

/** Parse a string into individual items by splitting on newlines / bullet chars. */
function parseStringItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/[\n\r]+/)
    .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

function extractTeamComposition(teamData: Record<string, unknown>): TeamComposition | undefined {
  const raw = toRecord(teamData.teamComposition);
  if (!raw || Object.keys(raw).length === 0) return undefined;
  return {
    businessLeadership: raw.businessLeadership === true,
    technicalCapability: raw.technicalCapability === true,
    domainExpertise: raw.domainExpertise === true,
    gtmCapability: raw.gtmCapability === true,
    sentence: typeof raw.sentence === "string" ? raw.sentence.trim() : undefined,
    reason: typeof raw.reason === "string" ? raw.reason.trim() : undefined,
  };
}

function extractFounderMarketFitScore(teamData: Record<string, unknown> | undefined): number | undefined {
  if (!teamData) return undefined;
  const fmf = toRecord(teamData.founderMarketFit);
  if (typeof fmf.score === "number") return fmf.score;
  if (typeof fmf.score === "string" && fmf.score.trim()) {
    const parsed = Number(fmf.score);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractFounderMarketFitWhy(teamData: Record<string, unknown> | undefined): string | undefined {
  if (!teamData) return undefined;
  const fmf = toRecord(teamData.founderMarketFit);
  if (typeof fmf.why === "string" && fmf.why.trim()) return fmf.why.trim();
  return undefined;
}

// ---------------------------------------------------------------------------
// Team member merge (5-layer resolution)
// ---------------------------------------------------------------------------

function parseDuration(duration?: string) {
  if (!duration) return { startDate: undefined, endDate: undefined, isCurrent: undefined };
  const [startRaw, endRaw] = duration.split("-").map((part) => part?.trim());
  if (!startRaw) return { startDate: undefined, endDate: undefined, isCurrent: undefined };
  const isCurrent = !endRaw || /present/i.test(endRaw);
  return {
    startDate: startRaw,
    endDate: isCurrent ? undefined : endRaw,
    isCurrent,
  };
}

function normalizeExperienceItems(
  experience: Array<Record<string, unknown>> | undefined,
) {
  if (!experience || experience.length === 0) return [];
  return experience.map((item) => {
    const duration = typeof item.duration === "string" ? item.duration : undefined;
    const parsed = parseDuration(duration);
    return {
      title: (item.title as string) || (item.position as string) || "Role",
      position: (item.position as string) || (item.title as string) || "Role",
      company: (item.company as string) || "",
      location: (item.location as string) || "",
      startDate: (item.startDate as string) || (item.start as string) || parsed.startDate,
      endDate: (item.endDate as string) || (item.end as string) || parsed.endDate,
      description: (item.description as string) || "",
      isCurrent:
        typeof item.isCurrent === "boolean" ? (item.isCurrent as boolean) : parsed.isCurrent,
    };
  });
}

function normalizeEducationItems(
  education: Array<Record<string, unknown>> | undefined,
) {
  if (!education || education.length === 0) return [];
  return education.map((item) => ({
    school: (item.school as string) || "",
    degree: (item.degree as string) || "",
    fieldOfStudy: (item.fieldOfStudy as string) || (item.field as string) || "",
    startDate:
      (item.startDate as string) ||
      (typeof item.startYear === "number" ? String(item.startYear) : undefined),
    endDate:
      (item.endDate as string) ||
      (typeof item.endYear === "number" ? String(item.endYear) : undefined),
  }));
}

function getTeamDataField<T>(teamData: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!teamData) return undefined;
  for (const key of keys) {
    if (teamData[key] !== undefined) return teamData[key] as T;
  }
  return undefined;
}

type RawMember = Record<string, unknown> & { name?: string; role?: string };

function resolveExperience(
  li: Record<string, unknown>,
  member: Record<string, unknown>,
  memberEval: Record<string, unknown> | undefined,
  founderData: RawMember | undefined,
  companyName?: string,
): TeamMember["experience"] {
  const expDetails = li.experienceDetails as Array<Record<string, unknown>> | undefined;
  const positions = li.positions as Array<Record<string, unknown>> | undefined;
  const experience = li.experience as Array<Record<string, unknown>> | undefined;
  const currentCompany = li.currentCompany as { name?: string; title?: string } | null | undefined;

  if (expDetails?.length) return normalizeExperienceItems(expDetails);
  if (positions?.length) return normalizeExperienceItems(positions);
  if (experience?.length) return normalizeExperienceItems(experience);
  if (currentCompany?.name || currentCompany?.title) {
    return [{
      title: currentCompany.title || (member.role as string) || "Current role",
      company: currentCompany.name || "",
      isCurrent: true,
    }];
  }
  if (member.role) {
    return [{
      title: member.role as string,
      company: companyName || "Current Company",
      isCurrent: true,
    }];
  }
  const evalPrevious = memberEval?.previousCompanies as string[] | undefined;
  if (evalPrevious?.length) {
    return evalPrevious.map((c) => ({ title: "Role", company: c }));
  }
  const founderPrevious = founderData?.previousCompanies as string[] | undefined;
  if (founderPrevious?.length) {
    return founderPrevious.map((c) => ({ title: "Role", company: c }));
  }
  return [];
}

function buildTeamMembers(
  evaluation: Evaluation | null,
  submittedMembers: TeamMember[],
  companyName?: string,
): TeamMember[] {
  const teamData = (evaluation?.teamData ?? {}) as Record<string, unknown>;
  const teamEvals = (evaluation?.teamMemberEvaluations ?? []) as unknown as Array<Record<string, unknown>>;

  const extractedFounders = (getTeamDataField<RawMember[]>(teamData, "enrichedMembers", "founders") ?? []) as RawMember[];
  const teamEvalMembers = (getTeamDataField<RawMember[]>(teamData, "teamMembers", "members") ??
    ((teamData.teamEvaluation as Record<string, unknown> | undefined)?.members as RawMember[] | undefined) ?? []) as RawMember[];

  const researchTeamMembers = teamEvalMembers;

  const submittedKeys = new Set(
    (submittedMembers ?? []).map((m) => normalizeKey(m.name)).filter(Boolean),
  );

  const shouldInclude = (name?: string) => Boolean(normalizeKey(name));

  const memberMap = new Map<string, Record<string, unknown> & { source: TeamMemberSource }>();

  // Layer 1 (lowest priority): extracted founders
  for (const founder of extractedFounders) {
    if (!shouldInclude(founder.name as string | undefined)) continue;
    const key = normalizeKey(founder.name as string | undefined);
    if (key) {
      memberMap.set(key, {
        ...founder,
        role: (founder.role as string) || "Founder",
        source: "scraped",
      });
    }
  }

  // Layer 2: evaluation agent results
  for (const evalMember of teamEvals) {
    if (!shouldInclude(evalMember.name as string | undefined)) continue;
    const key = normalizeKey(evalMember.name as string | undefined);
    if (key) {
      const existing = memberMap.get(key);
      memberMap.set(key, { ...existing, ...evalMember, source: "evaluation" });
    }
  }

  // Layer 3: research / teamData members
  for (const researchMember of researchTeamMembers) {
    if (!shouldInclude(researchMember.name as string | undefined)) continue;
    const key = normalizeKey(researchMember.name as string | undefined);
    if (key) {
      const existing = memberMap.get(key);
      memberMap.set(key, {
        ...existing,
        ...researchMember,
        bio: (researchMember.bio as string) || (existing?.bio as string) || "",
        imageUrl: (researchMember.imageUrl as string) || (existing?.imageUrl as string) || "",
        source: existing?.source ?? "evaluation",
      });
    }
  }

  // Layer 4 (highest priority): enriched / LinkedIn data via linkedinAnalysis on teamEvals

  // Layer 5 (top): submitted members always win
  for (const member of submittedMembers ?? []) {
    const key = normalizeKey(member.name);
    if (!key) continue;
    const existing = memberMap.get(key);
    memberMap.set(key, { ...existing, ...member, source: "submitted" });
  }

  const merged = Array.from(memberMap.values());
  if (merged.length === 0) {
    return (submittedMembers ?? []).map((m) => ({ ...m, source: "submitted" as const }));
  }

  return merged.map((member) => {
    const memberKey = normalizeKey(member.name as string | undefined);
    const isSubmittedMember = submittedKeys.has(memberKey);
    const hasEnrichment = teamEvals.some(
      (e) => normalizeKey(e.name as string | undefined) === memberKey && e.enrichmentStatus === "success",
    );
    const memberEval = teamEvals.find(
      (e) => normalizeKey(e.name as string | undefined) === memberKey,
    ) as Record<string, unknown> | undefined;
    const founderData = extractedFounders.find(
      (f) => normalizeKey(f.name as string | undefined) === memberKey,
    );
    const teamEvalData = teamEvalMembers.find(
      (f) => normalizeKey(f.name as string | undefined) === memberKey,
    );

    const linkedinAnalysis = (memberEval?.linkedinAnalysis ?? {}) as Record<string, unknown>;
    const linkedinData = (memberEval?.linkedinData ?? linkedinAnalysis) as Record<string, unknown>;
    const li = { ...memberEval, ...linkedinData, ...linkedinAnalysis } as Record<string, unknown>;

    const resolvedSource: TeamMemberSource = isSubmittedMember
      ? (hasEnrichment ? "enriched" : "submitted")
      : member.source;

    return {
      name: (member.name as string) || "Unknown",
      role: (memberEval?.role as string) || (member.role as string) || (founderData?.role as string) || "Team Member",
      discovered: !isSubmittedMember && Boolean(memberEval?.scrapedCandidate),
      source: resolvedSource,
      linkedinUrl:
        (memberEval?.linkedinUrl as string) || (member.linkedinUrl as string) || (founderData?.linkedinUrl as string),
      headline:
        (li.headline as string) ||
        (li.currentPosition as string) ||
        (founderData?.currentPosition as string) ||
        (member.headline as string) ||
        "",
      summary:
        (li.summary as string) ||
        (member.bio as string) ||
        (memberEval?.bio as string) ||
        (teamEvalData?.relevance as string) ||
        (founderData?.background as string) ||
        (linkedinAnalysis.background as string) ||
        "",
      profilePictureUrl:
        (li.profilePictureUrl as string) ||
        (li.profileImageUrl as string) ||
        (li.avatarUrl as string) ||
        (li.picture as string) ||
        (member.imageUrl as string) ||
        (memberEval?.imageUrl as string) ||
        (founderData?.profilePictureUrl as string) ||
        "",
      location: (li.location as string) || (founderData?.location as string) || "",
      experience: resolveExperience(li, member, memberEval, founderData, companyName),
      education:
        normalizeEducationItems(
          (li.educationDetails ?? li.education ?? memberEval?.education ?? founderData?.education) as
            | Array<Record<string, unknown>>
            | undefined,
        ),
      skills: (li.skills as string[]) || (founderData?.skills as string[]) || [],
      fmfScore:
        (teamEvalData?.fmfScore as number | undefined) ||
        (memberEval?.fmfScore as number | undefined) ||
        (founderData?.founderMarketFit as number | undefined) ||
        (linkedinAnalysis.founderFitScore as number | undefined),
      relevantExperience: (teamEvalData?.relevantExperience as string) || "",
      background:
        (teamEvalData?.relevance as string) ||
        (teamEvalData?.background as string) ||
        "",
    };
  });
}

// ---------------------------------------------------------------------------
// Inline sub-components
// ---------------------------------------------------------------------------

const CAPABILITY_ITEMS: Array<{
  key: keyof Pick<TeamComposition, "businessLeadership" | "technicalCapability" | "domainExpertise" | "gtmCapability">;
  label: string;
  icon: typeof Briefcase;
}> = [
  { key: "businessLeadership", label: "Business Leadership", icon: Briefcase },
  { key: "technicalCapability", label: "Technical Capability", icon: Code },
  { key: "domainExpertise", label: "Domain Expertise", icon: Globe },
  { key: "gtmCapability", label: "GTM Capability", icon: Megaphone },
];

function CapabilityBadge({
  label,
  covered,
  icon: Icon,
}: {
  label: string;
  covered: boolean;
  icon: typeof Briefcase;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-3",
        covered
          ? "border-emerald-400/35 bg-emerald-500/10"
          : "border-muted bg-muted/30",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", covered ? "text-emerald-600" : "text-muted-foreground")} />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {covered ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}

function fmfScoreColor(score: number): string {
  if (score > 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-500 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TeamTabContent({
  evaluation,
  teamMembers,
  showScores = true,
  teamWeight,
  companyName,
}: TeamTabContentProps) {
  const teamData = useMemo(
    () => toRecord(evaluation?.teamData),
    [evaluation],
  );

  const mergedMembers = useMemo(
    () => buildTeamMembers(evaluation, teamMembers, companyName),
    [evaluation, teamMembers, companyName],
  );

  const scoring = useMemo(() => toRecord(teamData.scoring), [teamData]);

  const teamConfidence = useMemo(() => {
    if (typeof scoring.confidence === "string") return scoring.confidence;
    if (typeof teamData.confidence === "string") return teamData.confidence;
    return "unknown";
  }, [scoring, teamData]);

  const teamSubScores = useMemo(() => toSubScores(scoring.subScores), [scoring]);

  const teamScoringBasis = useMemo(
    () => (typeof scoring.scoringBasis === "string" ? scoring.scoringBasis.trim() : undefined),
    [scoring],
  );

  const teamComposition = useMemo(() => extractTeamComposition(teamData), [teamData]);

  const coverageCount = useMemo(() => {
    if (!teamComposition) return 0;
    return CAPABILITY_ITEMS.filter((c) => teamComposition[c.key]).length;
  }, [teamComposition]);

  const fmfScore = useMemo(() => extractFounderMarketFitScore(teamData), [teamData]);
  const fmfWhy = useMemo(() => extractFounderMarketFitWhy(teamData), [teamData]);
  const roundedFmfScore = fmfScore !== undefined ? Math.round(fmfScore) : null;

  const strengths = useMemo(() => parseStringItems(teamData.strengths), [teamData]);
  const risks = useMemo(() => parseStringItems(teamData.risks), [teamData]);

  const dataGaps = useMemo(() => parseDataGapItems(teamData.dataGaps), [teamData]);

  return (
    <div className="space-y-6" data-testid="container-team-tab">
      {/* Section 1: Score Card */}
      {evaluation && showScores && (
        <SectionScoreCard
          title="Team Score"
          score={evaluation.teamScore || 0}
          weight={teamWeight}
          confidence={teamConfidence}
          scoringBasis={teamScoringBasis}
          subScores={teamSubScores}
          dataTestId="card-team-score"
          scoreTestId="text-team-score"
          confidenceTestId="badge-team-confidence"
        />
      )}

      {/* Section 2: Team Composition */}
      {teamComposition && (
        <Card className="border-primary/15" data-testid="card-team-composition">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Team Composition
            </CardTitle>
            <CardDescription>
              {coverageCount}/4 covered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {CAPABILITY_ITEMS.map((item) => (
                <CapabilityBadge
                  key={item.key}
                  label={item.label}
                  covered={teamComposition[item.key]}
                  icon={item.icon}
                />
              ))}
            </div>

            {teamComposition.sentence && (
              <MarkdownText className="text-sm text-muted-foreground [&>p]:mb-0">
                {teamComposition.sentence}
              </MarkdownText>
            )}
            {teamComposition.reason && teamComposition.reason !== teamComposition.sentence && (
              <MarkdownText className="text-xs text-muted-foreground italic [&>p]:mb-0">
                {teamComposition.reason}
              </MarkdownText>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section 3: Founder-Market Fit */}
      {(roundedFmfScore !== null || fmfWhy) && (
        <Card className="border-primary/15" data-testid="card-founder-market-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Founder-Market Fit
              {roundedFmfScore !== null && (
                <span
                  className={cn("ml-auto text-2xl font-bold tabular-nums", fmfScoreColor(roundedFmfScore))}
                  data-testid="text-fmf-score"
                >
                  {roundedFmfScore}<span className="text-sm font-medium text-muted-foreground">/100</span>
                </span>
              )}
            </CardTitle>
          </CardHeader>
          {fmfWhy && (
            <CardContent>
              <MarkdownText
                className="text-sm text-muted-foreground leading-relaxed [&>p]:mb-0"
                data-testid="text-fmf-why"
              >
                {fmfWhy}
              </MarkdownText>
            </CardContent>
          )}
        </Card>
      )}

      {/* Section 4: Team Member Cards */}
      {mergedMembers.length > 0 ? (
        <div data-testid="container-team-grid">
          <Card className="border-primary/15 mb-6" data-testid="card-team-profiles">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                <span data-testid="text-team-profiles-title">Team Members</span>
              </CardTitle>
              <CardDescription data-testid="text-team-profiles-description">
                LinkedIn-enriched profiles with experience timelines
              </CardDescription>
            </CardHeader>
          </Card>
          <TeamGrid members={mergedMembers} showTimelines={true} />
        </div>
      ) : (
        <Card className="border-dashed" data-testid="card-no-team-data">
          <CardContent className="p-12 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-semibold" data-testid="text-no-team-title">
              No team data
            </h3>
            <p className="text-muted-foreground" data-testid="text-no-team-message">
              Team information has not been submitted.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Section 5: Strengths & Risks */}
      {(strengths.length > 0 || risks.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2" data-testid="container-strengths-risks">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Team Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              {strengths.length > 0 ? (
                <ul className="space-y-2">
                  {strengths.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item}</MarkdownText>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No team strengths were identified in this run.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-500" />
                Team Risks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {risks.length > 0 ? (
                <ul className="space-y-2">
                  {risks.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                      <MarkdownText className="inline [&>p]:inline [&>p]:mb-0">{item}</MarkdownText>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No explicit team risks were identified in this run.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 6: Data Gaps */}
      <DataGapsSection gaps={dataGaps} />
    </div>
  );
}
