import {
  AdminSummaryTab,
  MarketTabContent,
  ProductTabContent,
  FinancialsTabContent,
  CompetitorsTabContent,
  buildTeamMembers,
} from "@/components/startup-view";
import { TeamGrid } from "@/components/TeamProfile";
import type { TeamMemberSource } from "@/components/TeamProfile";
import { MarkdownText } from "@/components/MarkdownText";
import type { Startup } from "@/types/startup";
import type { Evaluation } from "@/types/evaluation";
import type { ScoringWeights } from "@/lib/score-utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrintLayout, PrintPage, PrintCover } from "./PrintLayout";

interface PrintReportProps {
  startup: Startup;
  evaluation: Evaluation;
  weights: ScoringWeights | null;
  ready: boolean;
  generatedBy?: string | null;
  thesisAlignment?: {
    thesisFitScore: number;
    rationale: string;
  } | null;
}

type TeamMember = {
  name: string;
  role: string;
  linkedinUrl?: string;
  headline?: string;
  summary?: string;
  bio?: string;
  background?: string;
  discovered?: boolean;
  source?: TeamMemberSource;
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
  imageUrl?: string;
};

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function PrintTeamSummarySection({ teamMembers }: { teamMembers: TeamMember[] }) {
  if (teamMembers.length === 0) {
    return <p className="text-sm text-muted-foreground">No team member information available.</p>;
  }

  return (
    <div className="space-y-4">
      {teamMembers.map((member, index) => {
        const shortDescription = firstNonEmpty(member.headline, member.summary, member.bio, member.background);
        return (
          <section key={`${member.name}-${index}`} className="rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">{member.name}</h3>
                <p className="text-sm font-medium text-primary">{member.role || "Team Member"}</p>
              </div>
            </div>
            {shortDescription ? (
              <MarkdownText className="mt-2 text-sm text-muted-foreground [&>p]:mb-0">
                {shortDescription}
              </MarkdownText>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function PrintSectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-5 border-b border-border pb-2">
      <h2 className="text-xl text-[#163F67]">{title}</h2>
    </div>
  );
}

export function PrintReport({ startup, evaluation, weights, ready, generatedBy, thesisAlignment }: PrintReportProps) {
  const submittedTeamMembers =
    (startup.teamMembers as TeamMember[] | undefined) ?? [];
  const teamMembers = buildTeamMembers(evaluation, submittedTeamMembers, startup.name) as TeamMember[];
  const stage = typeof startup.stage === "string" ? startup.stage : undefined;

  return (
    <TooltipProvider>
      <PrintLayout ready={ready}>
      <PrintCover
        title="Startup Report"
        startupName={startup.name}
        stage={stage}
        subtitle={startup.description ?? undefined}
        generatedBy={generatedBy}
        score={typeof evaluation.overallScore === "number" ? evaluation.overallScore : undefined}
        logoUrl={startup.logoUrl ?? undefined}
      />

      <PrintPage>
        <PrintSectionTitle title="Summary" />
        <AdminSummaryTab
          startup={startup}
          evaluation={evaluation}
          weights={weights}
          thesisAlignment={thesisAlignment}
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle title="Market" />
        <MarketTabContent
          evaluation={evaluation}
          marketWeight={weights?.market}
          fundingStage={stage}
          showDataGaps={false}
          showKeyFindingsAndRisks={true}
          showScores
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle title="Product" />
        <ProductTabContent
          startup={startup}
          evaluation={evaluation}
          productWeight={weights?.product}
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle title="Team" />
        <PrintTeamSummarySection teamMembers={teamMembers} />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle title="Financials" />
        <FinancialsTabContent
          evaluation={evaluation}
          financialsWeight={weights?.financials}
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle title="Competitors" />
        <CompetitorsTabContent
          evaluation={evaluation}
          companyName={startup.name}
          forcePrint
        />
      </PrintPage>

      <PrintPage>
        <PrintSectionTitle title="Appendix — Team Profiles" />
        <TeamGrid members={teamMembers} showTimelines forcePrint />
      </PrintPage>
    </PrintLayout>
    </TooltipProvider>
  );
}
