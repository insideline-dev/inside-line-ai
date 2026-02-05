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

interface TeamMember {
  name: string;
  role: string;
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
}

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase() || "";
}

function buildTeamMembers(
  evaluation: Evaluation | null,
  submittedMembers: TeamMember[],
): TeamMember[] {
  const teamData = evaluation?.teamData as any;
  const teamEvals = (evaluation?.teamMemberEvaluations as any[]) || [];
  const extractedFounders = teamData?.enrichedMembers || teamData?.founders || [];
  const teamEvalMembers = teamData?.members || teamData?.teamEvaluation?.members || [];
  const researchTeamMembers =
    (evaluation as any)?.comprehensiveResearchData?.extractedData?.teamMembers ||
    [];

  const memberMap = new Map<string, any>();

  for (const evalMember of teamEvals) {
    const key = normalizeKey(evalMember.name);
    if (key) memberMap.set(key, { ...evalMember, source: "evaluation" });
  }

  for (const researchMember of researchTeamMembers) {
    const key = normalizeKey(researchMember.name);
    if (key) {
      const existing = memberMap.get(key);
      memberMap.set(key, {
        ...researchMember,
        ...existing,
        bio: researchMember.bio || existing?.bio,
        imageUrl: researchMember.imageUrl || existing?.imageUrl,
        source: existing?.source || "research",
      });
    }
  }

  for (const member of submittedMembers || []) {
    const key = normalizeKey(member.name);
    if (key) {
      const existing = memberMap.get(key);
      memberMap.set(key, { ...existing, ...member, source: "submitted" });
    }
  }

  for (const founder of extractedFounders) {
    const key = normalizeKey(founder.name);
    if (key) {
      const existing = memberMap.get(key);
      memberMap.set(key, {
        ...existing,
        ...founder,
        role: founder.role || existing?.role || "Founder",
        source: "extracted",
      });
    }
  }

  const merged = Array.from(memberMap.values());
  if (merged.length === 0) {
    return submittedMembers || [];
  }

  return merged.map((member: any) => {
    const memberEval = teamEvals.find(
      (e: any) => normalizeKey(e.name) === normalizeKey(member.name),
    );
    const founderData = extractedFounders.find(
      (f: any) => normalizeKey(f.name) === normalizeKey(member.name),
    );
    const teamEvalData = teamEvalMembers.find(
      (f: any) => normalizeKey(f.name) === normalizeKey(member.name),
    );

    const linkedinData =
      memberEval?.linkedinAnalysis || memberEval?.linkedinData || memberEval || {};

    return {
      name: member.name || "Unknown",
      role: memberEval?.role || member.role || founderData?.role || "Team Member",
      linkedinUrl:
        memberEval?.linkedinUrl || member.linkedinUrl || founderData?.linkedinUrl,
      headline:
        linkedinData.headline ||
        linkedinData.currentPosition ||
        founderData?.currentPosition ||
        member.headline ||
        "",
      summary:
        linkedinData.summary ||
        member.bio ||
        memberEval?.bio ||
        founderData?.background ||
        memberEval?.linkedinAnalysis?.background ||
        "",
      profilePictureUrl:
        linkedinData.profilePictureUrl ||
        member.imageUrl ||
        memberEval?.imageUrl ||
        founderData?.profilePictureUrl ||
        "",
      location: linkedinData.location || founderData?.location || "",
      experience:
        linkedinData.experienceDetails && linkedinData.experienceDetails.length > 0
          ? linkedinData.experienceDetails
          : linkedinData.positions && linkedinData.positions.length > 0
          ? linkedinData.positions
          : linkedinData.experience && linkedinData.experience.length > 0
          ? linkedinData.experience
          : memberEval?.previousCompanies &&
            memberEval.previousCompanies.length > 0
          ? memberEval.previousCompanies.map((c: string) => ({
              title: "Role",
              company: c,
            }))
          : founderData?.previousCompanies &&
            founderData.previousCompanies.length > 0
          ? founderData.previousCompanies.map((c: string) => ({
              title: "Role",
              company: c,
            }))
          : [],
      education:
        linkedinData.educationDetails ||
        linkedinData.education ||
        memberEval?.education ||
        founderData?.education ||
        [],
      skills: linkedinData.skills || founderData?.skills || [],
      fmfScore:
        teamEvalData?.fmfScore ||
        memberEval?.fmfScore ||
        founderData?.founderMarketFit ||
        memberEval?.linkedinAnalysis?.founderFitScore,
      relevantExperience: teamEvalData?.relevantExperience || "",
      background: teamEvalData?.background || "",
    };
  });
}

export function TeamTabContent({
  evaluation,
  teamMembers,
  showScores = true,
  teamWeight,
}: TeamTabContentProps) {
  const mergedMembers = useMemo(
    () => buildTeamMembers(evaluation, teamMembers),
    [evaluation, teamMembers],
  );

  return (
    <div className="space-y-6" data-testid="container-team-tab">
      {evaluation && showScores && (
        <TeamCompositionSummary
          teamScore={evaluation.teamScore || 0}
          teamComposition={
            (evaluation.teamData as any)?.teamComposition ||
            evaluation.teamComposition
          }
          keyStrengths={(evaluation.teamData as any)?.keyStrengths}
          keyRisks={(evaluation.teamData as any)?.keyRisks}
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
