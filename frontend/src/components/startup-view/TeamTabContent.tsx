import { Card, CardContent } from "@/components/ui/card";
// TODO: TeamGrid and TeamCompositionSummary components need to be migrated
// import { TeamGrid } from "@/components/TeamProfile";
// import { TeamCompositionSummary } from "@/components/TeamCompositionSummary";
import { Users } from "lucide-react";
import type { Evaluation } from "@/types/evaluation";

interface TeamMember {
  name: string;
  role: string;
  linkedinUrl?: string;
  photo?: string;
  headline?: string;
  experience?: Array<{
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    field?: string;
    startYear?: number;
    endYear?: number;
  }>;
  founderMarketFitScore?: number;
}

interface TeamTabContentProps {
  evaluation: Evaluation | null;
  teamMembers: TeamMember[];
  showScores?: boolean;
  teamWeight?: number;
}

export function TeamTabContent({}: TeamTabContentProps) {
  // TODO: Components not yet migrated - returning placeholder
  return (
    <div className="space-y-6" data-testid="container-team-tab">
      <Card className="border-dashed" data-testid="card-team-placeholder">
        <CardContent className="p-12 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">Team components not yet migrated</h3>
          <p className="text-muted-foreground">TeamGrid and TeamCompositionSummary need to be migrated first.</p>
        </CardContent>
      </Card>
    </div>
  );

  // Original implementation - restore after components are migrated:
  // return (
  //   <div className="space-y-6" data-testid="container-team-tab">
  //     {evaluation && showScores && (
  //       <TeamCompositionSummary
  //         teamScore={evaluation.teamScore || 0}
  //         teamComposition={(evaluation.teamData as any)?.teamComposition || evaluation.teamComposition}
  //         keyStrengths={(evaluation.teamData as any)?.keyStrengths}
  //         keyRisks={(evaluation.teamData as any)?.keyRisks}
  //         weight={teamWeight}
  //       />
  //     )}
  //
  //     <Card className="border-primary/20" data-testid="card-team-profiles">
  //       <CardHeader>
  //         <CardTitle className="text-base flex items-center gap-2">
  //           <Users className="w-5 h-5" />
  //           <span data-testid="text-team-profiles-title">Team Member Profiles</span>
  //         </CardTitle>
  //         <CardDescription data-testid="text-team-profiles-description">
  //           LinkedIn-enriched profiles with experience timelines
  //         </CardDescription>
  //       </CardHeader>
  //     </Card>
  //
  //     {teamMembers.length > 0 ? (
  //       <div data-testid="container-team-grid">
  //         <TeamGrid members={teamMembers} showTimelines={true} />
  //       </div>
  //     ) : (
  //       <Card className="border-dashed" data-testid="card-no-team-data">
  //         <CardContent className="p-12 text-center">
  //           <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
  //           <h3 className="font-semibold mb-2" data-testid="text-no-team-title">No team data</h3>
  //           <p className="text-muted-foreground" data-testid="text-no-team-message">Team information has not been submitted.</p>
  //         </CardContent>
  //       </Card>
  //     )}
  //   </div>
  // );
}
