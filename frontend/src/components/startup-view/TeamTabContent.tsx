import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { TeamGrid } from "@/components/TeamProfile";
import { TeamCompositionSummary } from "@/components/TeamCompositionSummary";
import { Users } from "lucide-react";
import type { Evaluation } from "@/types/evaluation";
import type { TeamMemberSource } from "@/components/TeamProfile";

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

interface TeamCompositionShape {
  hasBusinessLeader?: boolean;
  hasTechnicalLeader?: boolean;
  hasIndustryExpert?: boolean;
  hasOperationsLeader?: boolean;
  teamBalance?: string;
  functionalCoverage?: string;
}

interface FounderRecommendationItem {
  type: "hire" | "reframe" | "recommendation";
  bullet: string;
}

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase() || "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "present", "filled"].includes(normalized)) return true;
    if (["false", "no", "missing", "absent"].includes(normalized)) return false;
  }
  return undefined;
}

function extractTeamStrengths(evaluation: Evaluation | null): string[] {
  if (!evaluation) return [];
  const teamData = (evaluation.teamData as Record<string, unknown>) || {};
  const memberEvals = (evaluation.teamMemberEvaluations as unknown as any[]) || [];

  // New schema: strengths > keyStrengths > keyFindings (backward compat)
  const explicit =
    toStringArray((teamData as any).strengths).length > 0
      ? toStringArray((teamData as any).strengths)
      : toStringArray((teamData as any).keyStrengths).length > 0
        ? toStringArray((teamData as any).keyStrengths)
        : toStringArray((teamData as any).keyFindings);
  if (explicit.length > 0) {
    return dedupeStrings(explicit).slice(0, 5);
  }

  const memberStrengths = memberEvals.flatMap((member) =>
    toStringArray((member as any).strengths),
  );
  return dedupeStrings(memberStrengths).slice(0, 5);
}

function extractTeamRisks(evaluation: Evaluation | null): string[] {
  if (!evaluation) return [];
  const teamData = (evaluation.teamData as Record<string, unknown>) || {};
  const memberEvals = (evaluation.teamMemberEvaluations as unknown as any[]) || [];

  const explicit =
    toStringArray((teamData as any).keyRisks).length > 0
      ? toStringArray((teamData as any).keyRisks)
      : toStringArray((teamData as any).risks);
  if (explicit.length > 0) {
    return dedupeStrings(explicit).slice(0, 5);
  }

  const memberConcerns = memberEvals.flatMap((member) =>
    toStringArray((member as any).concerns),
  );
  const dataGaps = toStringArray((teamData as any).dataGaps);
  return dedupeStrings([...memberConcerns, ...dataGaps]).slice(0, 5);
}

function inferRoleCoverage(members: TeamMember[]): Omit<TeamCompositionShape, "teamBalance"> {
  const combined = members
    .map((member) => `${member.role || ""} ${member.headline || ""}`.toLowerCase())
    .join(" ");

  const hasBusinessLeader =
    /\b(ceo|chief executive|founder|co-founder|president|business|commercial|growth|sales)\b/.test(
      combined,
    );
  const hasTechnicalLeader =
    /\b(cto|chief technology|technical|engineering|engineer|architect|product|tech)\b/.test(
      combined,
    );
  const hasOperationsLeader =
    /\b(coo|chief operating|operations|ops|supply chain|logistics|general manager)\b/.test(
      combined,
    );
  const hasIndustryExpert =
    /\b(industry|domain|sector|advisor|expert|veteran|former)\b/.test(combined);

  return {
    hasBusinessLeader,
    hasTechnicalLeader,
    hasIndustryExpert,
    hasOperationsLeader,
  };
}

function resolveTeamComposition(
  evaluation: Evaluation | null,
  members: TeamMember[],
): TeamCompositionShape | undefined {
  if (!evaluation) return undefined;
  const teamData = (evaluation.teamData as Record<string, unknown>) || {};
  const raw =
    (teamData as any).teamComposition ||
    (teamData as any).functionalCoverage ||
    (evaluation.teamComposition as Record<string, unknown> | undefined);

  const getCovered = (candidate: unknown): boolean | undefined => {
    if (candidate && typeof candidate === "object") {
      return normalizeBoolean((candidate as Record<string, unknown>).covered);
    }
    return normalizeBoolean(candidate);
  };

  const inferred = inferRoleCoverage(members);
  const teamBalance =
    (typeof (raw as any)?.sentence === "string" && (raw as any).sentence.trim()) ||
    (typeof (raw as any)?.reason === "string" && (raw as any).reason.trim()) ||
    (typeof (raw as any)?.teamBalance === "string" && (raw as any).teamBalance.trim()) ||
    (typeof (teamData as any).executionCapability === "string" &&
      (teamData as any).executionCapability.trim()) ||
    (typeof (teamData as any).founderQuality === "string" &&
      (teamData as any).founderQuality.trim()) ||
    undefined;

  return {
    hasBusinessLeader:
      getCovered((raw as any)?.businessLeadership) ??
      normalizeBoolean((raw as any)?.hasBusinessLeader) ??
      inferred.hasBusinessLeader,
    hasTechnicalLeader:
      getCovered((raw as any)?.technicalCapability) ??
      normalizeBoolean((raw as any)?.hasTechnicalLeader) ??
      inferred.hasTechnicalLeader,
    hasIndustryExpert:
      getCovered((raw as any)?.domainExpertise) ??
      normalizeBoolean((raw as any)?.hasIndustryExpert) ??
      inferred.hasIndustryExpert,
    hasOperationsLeader:
      getCovered((raw as any)?.gtmCapability) ??
      normalizeBoolean((raw as any)?.hasOperationsLeader) ??
      inferred.hasOperationsLeader,
    teamBalance,
    functionalCoverage: extractFunctionalCoverage(teamData),
  };
}

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

/** Safely access teamData fields without `as any` on every line. */
function getTeamDataField<T>(teamData: Record<string, unknown> | undefined, ...keys: string[]): T | undefined {
  if (!teamData) return undefined;
  for (const key of keys) {
    if (teamData[key] !== undefined) return teamData[key] as T;
  }
  return undefined;
}

/** Extract founder-market fit score: new founderMarketFit.score > legacy founderMarketFitScore */
function extractFounderMarketFitScore(teamData: Record<string, unknown> | undefined): number | undefined {
  if (!teamData) return undefined;
  const fmf = teamData.founderMarketFit as Record<string, unknown> | undefined;
  if (fmf && typeof fmf.score === "number") return fmf.score;
  if (fmf && typeof fmf.score === "string" && fmf.score.trim()) {
    const parsed = Number(fmf.score);
    if (Number.isFinite(parsed)) return parsed;
  }
  const legacy = teamData.founderMarketFitScore;
  if (typeof legacy === "number") return legacy;
  if (typeof legacy === "string" && legacy.trim()) {
    const parsed = Number(legacy);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Extract founder-market fit rationale: new founderMarketFit.why > legacy fields */
function extractFounderMarketFitWhy(teamData: Record<string, unknown> | undefined): string | undefined {
  if (!teamData) return undefined;
  const fmf = teamData.founderMarketFit as Record<string, unknown> | undefined;
  if (fmf && typeof fmf.why === "string" && fmf.why.trim()) return fmf.why.trim();
  const legacy = teamData.founderMarketFitRationale ?? teamData.founderMarketFitReason;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return undefined;
}

/** Extract founderRecommendations array (new schema field). */
function extractFounderRecommendations(teamData: Record<string, unknown> | undefined): FounderRecommendationItem[] {
  if (!teamData) return [];
  const raw = teamData.founderRecommendations;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): FounderRecommendationItem | null => {
      if (typeof item === "string") {
        const bullet = item.trim();
        return bullet.length > 0 ? { type: "recommendation", bullet } : null;
      }
      if (!item || typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      const bullet = typeof record.bullet === "string" ? record.bullet.trim() : "";
      if (!bullet) return null;

      const rawType = typeof record.type === "string" ? record.type.toLowerCase().trim() : "";
      const type: FounderRecommendationItem["type"] =
        rawType === "hire" || rawType === "reframe" ? rawType : "recommendation";
      return { type, bullet };
    })
    .filter((item): item is FounderRecommendationItem => item !== null);
}

/** Extract functionalCoverage string/object from teamData. */
function extractFunctionalCoverage(teamData: Record<string, unknown> | undefined): string | undefined {
  if (!teamData) return undefined;
  const raw = teamData.teamComposition ?? teamData.functionalCoverage;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    // If it's a structured object, pull a summary key or stringify the keys
    const obj = raw as Record<string, unknown>;
    const summary =
      obj.sentence ??
      obj.reason ??
      obj.summary ??
      obj.assessment ??
      obj.overview;
    if (typeof summary === "string" && summary.trim()) return summary.trim();
  }
  return undefined;
}

type RawMember = Record<string, unknown> & { name?: string; role?: string };

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

  // Fix: actually populate research members from evaluation teamData
  const researchTeamMembers = teamEvalMembers;

  const submittedKeys = new Set(
    (submittedMembers ?? []).map((m) => normalizeKey(m.name)).filter(Boolean),
  );

  // Allow ALL named members through - don't restrict to submitted-only
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

  // Layer 4 (highest priority): enriched / LinkedIn data already on teamEvals
  // (handled during final merge below via linkedinAnalysis)

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
    // Merge linkedin sources: prefer linkedinAnalysis, fall back to linkedinData, then memberEval
    const li = { ...memberEval, ...linkedinData, ...linkedinAnalysis } as Record<string, unknown>;

    // Determine display source: enriched if LinkedIn data exists, otherwise track origin
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
      background: (teamEvalData?.background as string) || "",
    };
  });
}

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

export function TeamTabContent({
  evaluation,
  teamMembers,
  showScores = true,
  teamWeight,
  companyName,
}: TeamTabContentProps) {
  const mergedMembers = useMemo(
    () => buildTeamMembers(evaluation, teamMembers, companyName),
    [evaluation, teamMembers, companyName],
  );
  const teamComposition = useMemo(
    () => resolveTeamComposition(evaluation, mergedMembers),
    [evaluation, mergedMembers],
  );
  const teamStrengths = useMemo(() => extractTeamStrengths(evaluation), [evaluation]);
  const teamRisks = useMemo(() => extractTeamRisks(evaluation), [evaluation]);
  const teamData = useMemo(
    () => (evaluation?.teamData as Record<string, unknown> | undefined) ?? undefined,
    [evaluation],
  );
  const founderMarketFitScore = useMemo(() => extractFounderMarketFitScore(teamData), [teamData]);
  const founderMarketFitWhy = useMemo(() => extractFounderMarketFitWhy(teamData), [teamData]);
  const founderRecommendations = useMemo(() => extractFounderRecommendations(teamData), [teamData]);
  const teamConfidence = useMemo(() => {
    const directConfidence = teamData?.confidence;
    if (typeof directConfidence === "string") return directConfidence;

    const scoring = teamData?.scoring;
    if (scoring && typeof scoring === "object") {
      const scoringConfidence = (scoring as Record<string, unknown>).confidence;
      if (typeof scoringConfidence === "string") return scoringConfidence;
    }

    return "unknown";
  }, [teamData]);

  return (
    <div className="space-y-6" data-testid="container-team-tab">
      {evaluation && showScores && (
        <TeamCompositionSummary
          teamScore={evaluation.teamScore || 0}
          teamComposition={teamComposition}
          keyStrengths={teamStrengths}
          keyRisks={teamRisks}
          weight={teamWeight}
          confidence={teamConfidence}
          founderMarketFit={{
            score: founderMarketFitScore,
            why: founderMarketFitWhy,
          }}
        />
      )}

      {founderRecommendations.length > 0 && (
        <Card className="border-primary/20" data-testid="card-founder-recommendations">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span data-testid="text-founder-recommendations-title">Recommendations for Founders</span>
            </CardTitle>
            <CardDescription>Actionable guidance from the team evaluation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2" data-testid="container-founder-recommendations">
              {founderRecommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground" data-testid={`item-founder-rec-${i}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>
                    {rec.type === "hire"
                      ? "Hire: "
                      : rec.type === "reframe"
                        ? "Reframe: "
                        : ""}
                    {rec.bullet}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20" data-testid="card-team-profiles">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span data-testid="text-team-profiles-title">Team Member Profiles</span>
          </CardTitle>
          <CardDescription data-testid="text-team-profiles-description">
            LinkedIn-enriched profiles with experience timelines
          </CardDescription>
        </CardHeader>
      </Card>

      {mergedMembers.length > 0 ? (
        <div data-testid="container-team-grid">
          <TeamGrid members={mergedMembers} showTimelines={true} />
        </div>
      ) : (
        <Card className="border-dashed" data-testid="card-no-team-data">
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2" data-testid="text-no-team-title">
              No team data
            </h3>
            <p className="text-muted-foreground" data-testid="text-no-team-message">
              Team information has not been submitted.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
