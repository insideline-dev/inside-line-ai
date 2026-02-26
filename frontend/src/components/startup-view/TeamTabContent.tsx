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

  const explicit =
    toStringArray((teamData as any).keyStrengths).length > 0
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
    (evaluation.teamComposition as Record<string, unknown> | undefined);

  const inferred = inferRoleCoverage(members);
  const teamBalance =
    (typeof (raw as any)?.teamBalance === "string" && (raw as any).teamBalance.trim()) ||
    (typeof (teamData as any).executionCapability === "string" &&
      (teamData as any).executionCapability.trim()) ||
    (typeof (teamData as any).founderQuality === "string" &&
      (teamData as any).founderQuality.trim()) ||
    undefined;

  return {
    hasBusinessLeader:
      normalizeBoolean((raw as any)?.hasBusinessLeader) ?? inferred.hasBusinessLeader,
    hasTechnicalLeader:
      normalizeBoolean((raw as any)?.hasTechnicalLeader) ?? inferred.hasTechnicalLeader,
    hasIndustryExpert:
      normalizeBoolean((raw as any)?.hasIndustryExpert) ?? inferred.hasIndustryExpert,
    hasOperationsLeader:
      normalizeBoolean((raw as any)?.hasOperationsLeader) ?? inferred.hasOperationsLeader,
    teamBalance,
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

  return (
    <div className="space-y-6" data-testid="container-team-tab">
      {evaluation && showScores && (
        <TeamCompositionSummary
          teamScore={evaluation.teamScore || 0}
          teamComposition={teamComposition}
          keyStrengths={teamStrengths}
          keyRisks={teamRisks}
          weight={teamWeight}
        />
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
