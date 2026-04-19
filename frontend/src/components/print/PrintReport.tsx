import {
  AdminSummaryTab,
  MarketTabContent,
  ProductTabContent,
  TeamTabContent,
  FinancialsTabContent,
  CompetitorsTabContent,
} from "@/components/startup-view";
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
}

type TeamMember = { name: string; role: string; linkedinUrl?: string };

function PrintSectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-5 border-b border-border pb-2">
      <h2 className="text-xl text-[#163F67]">{title}</h2>
    </div>
  );
}

export function PrintReport({ startup, evaluation, weights, ready, generatedBy }: PrintReportProps) {
  const teamMembers =
    (startup.teamMembers as TeamMember[] | undefined) ?? [];
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
        <AdminSummaryTab startup={startup} evaluation={evaluation} weights={weights} />
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
        <TeamTabContent
          evaluation={evaluation}
          teamMembers={teamMembers}
          teamWeight={weights?.team}
          companyName={startup.name}
          forcePrint
        />
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
    </PrintLayout>
    </TooltipProvider>
  );
}
